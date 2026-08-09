import type { Prisma, VersionSource } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, forbidden, notFound, unmanufacturable } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/http.js';
import { aiClient, type AiImage, type DesignSpec } from '../../services/aiClient.js';
import { loadActiveCostRules, persistEstimate } from '../../services/costing.js';
import { uploadImageBase64 } from '../../services/storage.js';
import { designSpecSchema } from './schema.js';
import type {
  EditDesignInput,
  GenerateDesignInput,
  ListDesignsQuery,
} from './schema.js';

export interface Identity {
  userId?: string | null;
  guestToken?: string | null;
}

const versionInclude = {
  images: { orderBy: { sortOrder: 'asc' } },
  costEstimate: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.DesignVersionInclude;

/** Ownership check that accepts either a signed-in owner or the guest token. */
async function loadOwnedDesign(designId: string, identity: Identity) {
  const design = await prisma.design.findUnique({
    where: { id: designId },
    include: { currentVersion: { include: versionInclude } },
  });
  if (!design) throw notFound('That design');

  const ownedByUser = identity.userId && design.ownerId === identity.userId;
  const ownedByGuest =
    identity.guestToken && design.guestToken && design.guestToken === identity.guestToken;

  if (!ownedByUser && !ownedByGuest) throw forbidden('This design belongs to someone else.');
  return design;
}

/** Guest quota — a visitor gets a small number of free generations before signup. */
async function assertGuestQuota(identity: Identity): Promise<void> {
  if (identity.userId) return;
  if (!identity.guestToken) throw badRequest('Start a design session first.');

  const used = await prisma.design.count({ where: { guestToken: identity.guestToken } });
  if (used >= env.GUEST_FREE_GENERATIONS) {
    throw forbidden(
      'Create a free account to keep designing — your current design comes with you.',
    );
  }
}

/**
 * GPT Image returns base64, not a hosted URL. Push each render to Supabase
 * Storage and keep the public URL. Uploads that fail come back null and are
 * dropped — imagery is an enhancement, and losing a picture must never cost
 * the customer their design.
 */
async function storeImages(
  images: AiImage[] | undefined,
  ownerId: string,
): Promise<{ view: string; url: string }[]> {
  if (!images?.length) return [];

  const stored = await Promise.all(
    images.map(async (img) => {
      const url = await uploadImageBase64('designs', ownerId, img.b64, img.contentType);
      return url ? { view: img.view, url } : null;
    }),
  );

  return stored.filter((i): i is { view: string; url: string } => i !== null);
}

function coverFrom(images: { view: string; url: string }[]): string | null {
  return images.find((i) => i.view === 'FRONT')?.url ?? images[0]?.url ?? null;
}

/**
 * Creates version N+1 for a design. Versions are IMMUTABLE — this only ever
 * inserts. `parentVersionId` is what makes branching work: pass the version the
 * customer was looking at, not necessarily the latest one.
 */
async function createVersion(
  tx: Prisma.TransactionClient,
  params: {
    designId: string;
    parentVersionId: string | null;
    source: VersionSource;
    spec: DesignSpec;
    attributeConfidence?: Record<string, string> | null;
    editInstruction?: string | null;
    aiSummary?: string | null;
    manufacturability?: unknown;
    isManufacturable?: boolean;
    images?: { view: string; url: string }[];
    costEstimate?: Parameters<typeof persistEstimate>[2] | null;
    setAsCurrent?: boolean;
  },
) {
  const last = await tx.designVersion.findFirst({
    where: { designId: params.designId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });

  const version = await tx.designVersion.create({
    data: {
      designId: params.designId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      parentVersionId: params.parentVersionId,
      source: params.source,
      spec: params.spec as unknown as Prisma.InputJsonValue,
      attributeConfidence: (params.attributeConfidence ?? {}) as Prisma.InputJsonValue,
      editInstruction: params.editInstruction ?? null,
      aiSummary: params.aiSummary ?? null,
      isManufacturable: params.isManufacturable ?? true,
      manufacturability: (params.manufacturability ?? {}) as Prisma.InputJsonValue,
      images: params.images?.length
        ? {
            create: params.images.map((img, index) => ({
              view: img.view,
              url: img.url,
              sortOrder: index,
            })),
          }
        : undefined,
    },
  });

  if (params.costEstimate) {
    await persistEstimate(tx, version.id, params.costEstimate);
  }

  if (params.setAsCurrent !== false) {
    await tx.design.update({
      where: { id: params.designId },
      data: {
        currentVersionId: version.id,
        category: params.spec.category,
        silhouette: params.spec.silhouette,
        fabric: params.spec.fabric,
        occasion: params.spec.occasion ?? null,
        coverUrl: params.images?.[0]?.url ?? undefined,
      },
    });
  }

  return version;
}

export const designService = {
  createVersion,
  loadOwnedDesign,

  /**
   * Turns a brief into up to four manufacturable concepts. Each concept becomes
   * its own Design so the customer can keep exploring all of them.
   */
  async generate(input: GenerateDesignInput, identity: Identity) {
    await assertGuestQuota(identity);

    const job = await prisma.aiJob.create({
      data: {
        type: 'DESIGN_GENERATE',
        status: 'RUNNING',
        stage: 'Understanding your inspiration',
        stageIndex: 0,
        stageCount: 5,
        startedAt: new Date(),
        input: {
          brief: input.brief,
          inspirationUrls: input.inspirationUrls,
          targetBudget: input.targetBudget ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    try {
      const costRules = await loadActiveCostRules();
      const result = await aiClient.generateDesign({
        brief: input.brief,
        inspirationUrls: input.inspirationUrls,
        targetBudget: input.targetBudget ?? null,
        conceptCount: input.conceptCount,
        costRules,
      });

      // Upload renders BEFORE opening the transaction — these are network round
      // trips to Supabase and must not hold a database transaction open.
      const storageOwner = identity.userId ?? identity.guestToken ?? 'anonymous';
      const conceptImages = await Promise.all(
        result.concepts.map((concept) => storeImages(concept.images, storageOwner)),
      );

      const designs = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const [index, concept] of result.concepts.entries()) {
          const spec = designSpecSchema.parse(concept.spec);
          const images = conceptImages[index] ?? [];

          const design = await tx.design.create({
            data: {
              ownerId: identity.userId ?? null,
              guestToken: identity.userId ? null : identity.guestToken,
              title: concept.name,
              status: 'ACTIVE',
              briefText: input.brief,
              inspirationUrls: input.inspirationUrls,
              targetBudget: input.targetBudget ?? null,
              category: spec.category,
              silhouette: spec.silhouette,
              fabric: spec.fabric,
              occasion: spec.occasion ?? null,
              coverUrl: coverFrom(images),
            },
          });

          await createVersion(tx, {
            designId: design.id,
            parentVersionId: null,
            source: 'GENERATION',
            spec,
            attributeConfidence: concept.attributeConfidence,
            aiSummary: concept.summary,
            manufacturability: concept.manufacturability,
            isManufacturable: concept.manufacturability.isManufacturable,
            images,
            costEstimate: concept.costEstimate,
          });

          out.push(design.id);
        }
        return out;
      });

      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          stage: 'Preparing your concepts',
          stageIndex: 4,
          completedAt: new Date(),
          output: { designIds: designs } as Prisma.InputJsonValue,
          model: result.usage?.model ?? null,
          inputTokens: result.usage?.inputTokens ?? null,
          outputTokens: result.usage?.outputTokens ?? null,
          costPaise: result.usage?.costPaise ?? null,
          latencyMs: result.usage?.latencyMs ?? null,
        },
      });

      const created = await prisma.design.findMany({
        where: { id: { in: designs } },
        include: { currentVersion: { include: versionInclude } },
        orderBy: { createdAt: 'asc' },
      });

      return { jobId: job.id, designs: created };
    } catch (err) {
      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  },

  async get(designId: string, identity: Identity) {
    const design = await loadOwnedDesign(designId, identity);
    const versions = await prisma.designVersion.findMany({
      where: { designId },
      orderBy: { versionNumber: 'asc' },
      select: {
        id: true,
        versionNumber: true,
        parentVersionId: true,
        source: true,
        editInstruction: true,
        aiSummary: true,
        isManufacturable: true,
        createdAt: true,
        costEstimate: { select: { minTotal: true, maxTotal: true, confidence: true } },
      },
    });
    return { ...design, versions };
  },

  async list(query: ListDesignsQuery, identity: Identity) {
    const where: Prisma.DesignWhereInput = identity.userId
      ? { ownerId: identity.userId }
      : { guestToken: identity.guestToken ?? '__none__' };

    if (query.status) where.status = query.status;
    else where.status = { not: 'ARCHIVED' };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { briefText: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.design.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      ...cursorArgs(query.cursor, query.limit),
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            costEstimate: { select: { minTotal: true, maxTotal: true } },
          },
        },
      },
    });

    return toPage(rows, query.limit);
  },

  /**
   * Conversational edit. Creates a NEW immutable version — the previous one is
   * never modified, which is what makes experimenting safe.
   */
  async edit(designId: string, input: EditDesignInput, identity: Identity) {
    const design = await loadOwnedDesign(designId, identity);

    const parentId = input.fromVersionId ?? design.currentVersionId;
    if (!parentId) throw badRequest('This design has no version to edit yet.');

    const parent = await prisma.designVersion.findFirst({
      where: { id: parentId, designId },
      include: { costEstimate: true },
    });
    if (!parent) throw notFound('That version');

    const job = await prisma.aiJob.create({
      data: {
        designId,
        type: 'DESIGN_EDIT',
        status: 'RUNNING',
        stage: 'Applying your change',
        startedAt: new Date(),
        stageCount: 3,
        input: { instruction: input.instruction, fromVersionId: parentId } as Prisma.InputJsonValue,
      },
    });

    try {
      const costRules = await loadActiveCostRules();
      const result = await aiClient.editDesign({
        spec: parent.spec as unknown as DesignSpec,
        instruction: input.instruction,
        currentEstimate: parent.costEstimate
          ? { minTotal: parent.costEstimate.minTotal, maxTotal: parent.costEstimate.maxTotal }
          : null,
        costRules,
      });

      // PRODUCT RULE: never silently accept an unmanufacturable instruction.
      if (!result.manufacturability.isManufacturable) {
        await prisma.aiJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', completedAt: new Date(), error: 'UNMANUFACTURABLE' },
        });
        throw unmanufacturable(
          result.manufacturability.blockers[0] ??
            "That combination can't be reliably stitched by our current designer network.",
          result.manufacturability.alternatives,
        );
      }

      const spec = designSpecSchema.parse(result.spec);

      // Uploads happen outside the transaction — see storeImages().
      const images = await storeImages(
        result.images,
        identity.userId ?? identity.guestToken ?? 'anonymous',
      );

      const version = await prisma.$transaction((tx) =>
        createVersion(tx, {
          designId,
          parentVersionId: parentId,
          source: 'EDIT',
          spec,
          attributeConfidence: result.attributeConfidence,
          editInstruction: input.instruction,
          aiSummary: result.summary,
          manufacturability: result.manufacturability,
          isManufacturable: true,
          images,
          costEstimate: result.costEstimate,
        }),
      );

      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          output: { versionId: version.id } as Prisma.InputJsonValue,
          model: result.usage?.model ?? null,
          inputTokens: result.usage?.inputTokens ?? null,
          outputTokens: result.usage?.outputTokens ?? null,
          latencyMs: result.usage?.latencyMs ?? null,
        },
      });

      return prisma.designVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: versionInclude,
      });
    } catch (err) {
      await prisma.aiJob
        .update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            error: err instanceof Error ? err.message : String(err),
          },
        })
        .catch(() => undefined);
      throw err;
    }
  },

  /** Jump the design back to an earlier version (undo / redo / pick from tree). */
  async setCurrentVersion(designId: string, versionId: string, identity: Identity) {
    await loadOwnedDesign(designId, identity);
    const version = await prisma.designVersion.findFirst({
      where: { id: versionId, designId },
      include: versionInclude,
    });
    if (!version) throw notFound('That version');

    const spec = version.spec as unknown as DesignSpec;
    await prisma.design.update({
      where: { id: designId },
      data: {
        currentVersionId: versionId,
        category: spec.category,
        silhouette: spec.silhouette,
        fabric: spec.fabric,
        occasion: spec.occasion ?? null,
        coverUrl: version.images[0]?.url ?? undefined,
      },
    });
    return version;
  },

  async getVersion(designId: string, versionId: string, identity: Identity) {
    await loadOwnedDesign(designId, identity);
    const version = await prisma.designVersion.findFirst({
      where: { id: versionId, designId },
      include: versionInclude,
    });
    if (!version) throw notFound('That version');
    return version;
  },

  /** Side-by-side diff for the compare view. */
  async compare(designId: string, aId: string, bId: string, identity: Identity) {
    await loadOwnedDesign(designId, identity);
    const [a, b] = await Promise.all([
      prisma.designVersion.findFirst({ where: { id: aId, designId }, include: versionInclude }),
      prisma.designVersion.findFirst({ where: { id: bId, designId }, include: versionInclude }),
    ]);
    if (!a || !b) throw notFound('One of those versions');

    const specA = a.spec as Record<string, unknown>;
    const specB = b.spec as Record<string, unknown>;
    const keys = new Set([...Object.keys(specA), ...Object.keys(specB)]);

    const changes = [...keys]
      .map((key) => ({
        attribute: key,
        from: specA[key] ?? null,
        to: specB[key] ?? null,
      }))
      .filter((c) => JSON.stringify(c.from) !== JSON.stringify(c.to));

    return {
      a,
      b,
      changes,
      priceDelta:
        (b.costEstimate?.maxTotal ?? 0) - (a.costEstimate?.maxTotal ?? 0),
    };
  },

  async update(
    designId: string,
    data: { title?: string; status?: 'ACTIVE' | 'ARCHIVED'; targetBudget?: number | null },
    identity: Identity,
  ) {
    await loadOwnedDesign(designId, identity);
    return prisma.design.update({
      where: { id: designId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.targetBudget !== undefined ? { targetBudget: data.targetBudget } : {}),
      },
    });
  },

  async duplicate(designId: string, identity: Identity) {
    const design = await loadOwnedDesign(designId, identity);
    if (!design.currentVersion) throw badRequest('There is nothing to duplicate yet.');

    const source = design.currentVersion;
    return prisma.$transaction(async (tx) => {
      const copy = await tx.design.create({
        data: {
          ownerId: design.ownerId,
          guestToken: design.guestToken,
          title: `${design.title} (copy)`,
          briefText: design.briefText,
          inspirationUrls: design.inspirationUrls,
          targetBudget: design.targetBudget,
        },
      });

      await createVersion(tx, {
        designId: copy.id,
        parentVersionId: null,
        source: 'MANUAL',
        spec: source.spec as unknown as DesignSpec,
        attributeConfidence: source.attributeConfidence as Record<string, string> | null,
        aiSummary: source.aiSummary,
        manufacturability: source.manufacturability,
        isManufacturable: source.isManufacturable,
        images: source.images.map((i) => ({ view: i.view, url: i.url })),
        costEstimate: source.costEstimate
          ? {
              minTotal: source.costEstimate.minTotal,
              maxTotal: source.costEstimate.maxTotal,
              confidence: source.costEstimate.confidence,
              lineItems: source.costEstimate.lineItems.map((li) => ({
                component: li.component,
                label: li.label,
                minAmount: li.minAmount,
                maxAmount: li.maxAmount,
                quantity: li.quantity,
                unit: li.unit,
                notes: li.notes,
              })),
            }
          : null,
      });

      return copy;
    });
  },

  async remove(designId: string, identity: Identity) {
    await loadOwnedDesign(designId, identity);
    // Soft delete — an ordered design must remain readable for the order record.
    await prisma.design.update({ where: { id: designId }, data: { status: 'ARCHIVED' } });
  },

  /** Poll target for the staged generation loader. */
  async getJob(jobId: string) {
    const job = await prisma.aiJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        type: true,
        status: true,
        stage: true,
        stageIndex: true,
        stageCount: true,
        output: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });
    if (!job) throw notFound('That job');
    return job;
  },
};
