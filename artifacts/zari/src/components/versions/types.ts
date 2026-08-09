/**
 * The version tree, as the UI needs it.
 *
 * A design's history is a real tree, not a timeline: `parentVersionId` is set on
 * every version after the first, and editing an *older* version creates a second
 * child of that version — a branch. Nothing is ever updated in place, which is
 * the whole reason this screen can promise that nothing is lost.
 */

export type VersionSource =
  | 'GENERATION'
  | 'EDIT'
  | 'BUDGET_PLAN'
  | 'DESIGNER_PROPOSAL'
  | 'MANUAL';

export const VERSION_SOURCES: VersionSource[] = [
  'GENERATION',
  'EDIT',
  'BUDGET_PLAN',
  'DESIGNER_PROPOSAL',
  'MANUAL',
];

/** What a customer is told produced this version. */
export const SOURCE_LABELS: Record<VersionSource, string> = {
  GENERATION: 'First direction from your brief',
  EDIT: 'Your edit',
  BUDGET_PLAN: 'Budget plan you accepted',
  DESIGNER_PROPOSAL: 'Proposed by a designer',
  MANUAL: 'Attribute you set yourself',
};

/** The short form, for the chip on the node. */
export const SOURCE_CHIPS: Record<VersionSource, string> = {
  GENERATION: 'GENERATED',
  EDIT: 'EDIT',
  BUDGET_PLAN: 'BUDGET',
  DESIGNER_PROPOSAL: 'DESIGNER',
  MANUAL: 'MANUAL',
};

export interface VersionEstimate {
  /** Paise. */
  minTotal: number;
  /** Paise. */
  maxTotal: number;
  confidence?: string | null;
}

export interface VersionNode {
  id: string;
  versionNumber: number;
  /** Null only for the very first version. */
  parentVersionId: string | null;
  source: VersionSource;
  editInstruction: string | null;
  aiSummary: string | null;
  isManufacturable: boolean;
  createdAt: string;
  costEstimate: VersionEstimate | null;
  /**
   * Only the demo set carries a spec — the tree endpoint does not return one.
   * It lets compare work offline instead of showing an empty diff.
   */
  spec?: Record<string, string>;
}

export interface VersionTreeData {
  currentVersionId: string | null;
  versions: VersionNode[];
}

export interface VersionChange {
  attribute: string;
  from: unknown;
  to: unknown;
}

export interface ComparedVersion {
  id: string;
  versionNumber: number;
  costEstimate: VersionEstimate | null;
}

export interface VersionComparison {
  a: ComparedVersion;
  b: ComparedVersion;
  changes: VersionChange[];
  /** Paise, b minus a, measured at the top of each range. */
  priceDelta: number;
}

/** One rendered line of the tree. */
export interface TreeRow {
  node: VersionNode;
  depth: number;
  /**
   * For each ancestor level, whether that ancestor has later siblings — i.e.
   * whether a vertical line has to keep running down that column past this row.
   * Only entries below `depth - 1` are drawn; the last column holds the elbow.
   */
  guides: boolean[];
  isLastChild: boolean;
  childCount: number;
  /** 0 for the first child of a parent; above 0 means this line is a branch. */
  branchIndex: number;
  parentNumber: number | null;
}

/**
 * Depth-first layout, oldest first.
 *
 * A version whose parent is missing is treated as a root rather than dropped —
 * `parentVersionId` is nullable on delete, and losing a version off the screen
 * would contradict the one thing this component promises.
 */
export function layoutTree(versions: VersionNode[]): TreeRow[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const children = new Map<string, VersionNode[]>();
  const roots: VersionNode[] = [];

  for (const version of [...versions].sort((a, b) => a.versionNumber - b.versionNumber)) {
    const parentId =
      version.parentVersionId && byId.has(version.parentVersionId) && version.parentVersionId !== version.id
        ? version.parentVersionId
        : null;
    if (!parentId) {
      roots.push(version);
      continue;
    }
    const siblings = children.get(parentId) ?? [];
    siblings.push(version);
    children.set(parentId, siblings);
  }

  const rows: TreeRow[] = [];
  const seen = new Set<string>();

  const walk = (
    node: VersionNode,
    guides: boolean[],
    isLastChild: boolean,
    branchIndex: number,
  ): void => {
    // Cheap cycle guard: a malformed parent pointer should not hang the studio.
    if (seen.has(node.id)) return;
    seen.add(node.id);

    const depth = guides.length;
    const kids = children.get(node.id) ?? [];
    const parent = node.parentVersionId ? byId.get(node.parentVersionId) : undefined;

    rows.push({
      node,
      depth,
      guides,
      isLastChild,
      childCount: kids.length,
      branchIndex,
      parentNumber: parent?.versionNumber ?? null,
    });

    // This node's own column keeps a vertical line running only while it still
    // has a sibling below — that is what makes a branch read as a branch. The
    // extra slot is the child's own elbow column and is never drawn as a line.
    const childGuides = [...guides];
    if (depth > 0) childGuides[depth - 1] = !isLastChild;
    childGuides.push(false);

    kids.forEach((kid, index) => walk(kid, childGuides, index === kids.length - 1, index));
  };

  roots.forEach((root, index) => walk(root, [], index === roots.length - 1, 0));
  return rows;
}

export const parentOf = (versions: VersionNode[], node: VersionNode | null): VersionNode | null => {
  if (!node?.parentVersionId) return null;
  return versions.find((v) => v.id === node.parentVersionId) ?? null;
};

/**
 * Redo goes to the newest thing made *from* this version. When an older version
 * has been branched more than once, the most recent branch is the one a
 * customer just came from, so that is the one redo returns to.
 */
export const newestChildOf = (
  versions: VersionNode[],
  node: VersionNode | null,
): VersionNode | null => {
  if (!node) return null;
  const kids = versions.filter((v) => v.parentVersionId === node.id);
  if (kids.length === 0) return null;
  return [...kids].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
};

export const versionLabel = (versionNumber: number): string =>
  `v${String(versionNumber).padStart(2, '0')}`;

const titleCase = (value: string): string =>
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

export const attributeLabel = titleCase;

/** Renders a spec value from the compare endpoint, which is raw JSON. */
export function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (Array.isArray(value)) return value.length ? value.map(describeValue).join(', ') : 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Quiet, human time. Deliberately shorter than the design-list wording. */
export function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The comparison the demo set gets when the API is unreachable, built from the
 * specs the demo versions carry. Live data comes from the compare endpoint.
 */
export function compareLocally(a: VersionNode, b: VersionNode): VersionComparison {
  const specA = a.spec ?? {};
  const specB = b.spec ?? {};
  const keys = [...new Set([...Object.keys(specA), ...Object.keys(specB)])];

  const changes: VersionChange[] = keys
    .map((attribute) => ({
      attribute,
      from: specA[attribute] ?? null,
      to: specB[attribute] ?? null,
    }))
    .filter((change) => change.from !== change.to);

  return {
    a: { id: a.id, versionNumber: a.versionNumber, costEstimate: a.costEstimate },
    b: { id: b.id, versionNumber: b.versionNumber, costEstimate: b.costEstimate },
    changes,
    priceDelta: (b.costEstimate?.maxTotal ?? 0) - (a.costEstimate?.maxTotal ?? 0),
  };
}
