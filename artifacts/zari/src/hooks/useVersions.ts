import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { useApiData, type ApiData } from './useApiData';
import { demoVersionTree } from '@/components/versions/demoTree';
import {
  VERSION_SOURCES,
  type ComparedVersion,
  type VersionComparison,
  type VersionNode,
  type VersionSource,
  type VersionTreeData,
} from '@/components/versions/types';

/**
 * Reading and moving through a design's version history.
 *
 * Kept out of `services/designs.ts` on purpose: this is the only place that
 * needs the tree shape, and undo, redo and jump are all the same call —
 * `POST /designs/:id/versions/:versionId/activate`.
 */

interface ApiEstimate {
  minTotal: number;
  maxTotal: number;
  confidence?: string | null;
}

interface ApiVersionRow {
  id: string;
  versionNumber: number;
  parentVersionId?: string | null;
  source?: string;
  editInstruction?: string | null;
  aiSummary?: string | null;
  isManufacturable?: boolean;
  createdAt?: string;
  costEstimate?: ApiEstimate | null;
}

interface ApiDesignWithVersions {
  id: string;
  currentVersionId?: string | null;
  currentVersion?: { id: string } | null;
  versions?: ApiVersionRow[];
}

interface ApiComparison {
  a: ApiVersionRow;
  b: ApiVersionRow;
  changes?: { attribute: string; from: unknown; to: unknown }[];
  priceDelta?: number;
}

const toSource = (value: string | undefined): VersionSource =>
  VERSION_SOURCES.includes(value as VersionSource) ? (value as VersionSource) : 'EDIT';

const toEstimate = (estimate: ApiEstimate | null | undefined) =>
  estimate
    ? {
        minTotal: estimate.minTotal,
        maxTotal: estimate.maxTotal,
        confidence: estimate.confidence ?? null,
      }
    : null;

const toNode = (row: ApiVersionRow): VersionNode => ({
  id: row.id,
  versionNumber: row.versionNumber,
  parentVersionId: row.parentVersionId ?? null,
  source: toSource(row.source),
  editInstruction: row.editInstruction ?? null,
  aiSummary: row.aiSummary ?? null,
  isManufacturable: row.isManufacturable ?? true,
  createdAt: row.createdAt ?? new Date().toISOString(),
  costEstimate: toEstimate(row.costEstimate),
});

const toCompared = (row: ApiVersionRow): ComparedVersion => ({
  id: row.id,
  versionNumber: row.versionNumber,
  costEstimate: toEstimate(row.costEstimate),
});

async function fetchVersionTree(designId: string): Promise<VersionTreeData> {
  const design = await api.get<ApiDesignWithVersions>(`/designs/${designId}`);
  const versions = (design.versions ?? []).map(toNode);
  return {
    // The design row carries the pointer; the last version is only a fallback
    // for an older payload that does not.
    currentVersionId:
      design.currentVersionId ?? design.currentVersion?.id ?? versions[versions.length - 1]?.id ?? null,
    versions,
  };
}

async function fetchComparison(
  designId: string,
  aId: string,
  bId: string,
): Promise<VersionComparison> {
  const result = await api.get<ApiComparison>(
    `/designs/${designId}/versions/compare?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`,
  );
  return {
    a: toCompared(result.a),
    b: toCompared(result.b),
    changes: result.changes ?? [],
    priceDelta: result.priceDelta ?? 0,
  };
}

/** The whole history for a design, with the demo tree as the fallback. */
export function useVersionTree(designId: string | undefined): ApiData<VersionTreeData> {
  return useApiData<VersionTreeData>(
    ['design-versions', designId],
    () => fetchVersionTree(designId!),
    demoVersionTree,
    { enabled: Boolean(designId), fallbackOnEmpty: false },
  );
}

/**
 * The diff between two versions. `fallback` is the locally computed comparison,
 * so the demo set can still show a real side-by-side.
 */
export function useVersionComparison(
  designId: string | undefined,
  aId: string | null,
  bId: string | null,
  fallback: VersionComparison | null,
): ApiData<VersionComparison | null> {
  return useApiData<VersionComparison | null>(
    ['design-compare', designId, aId, bId],
    () => fetchComparison(designId!, aId!, bId!),
    fallback,
    { enabled: Boolean(designId && aId && bId && aId !== bId), fallbackOnEmpty: false },
  );
}

/**
 * Undo, redo and jump-to-version are all this one call. Nothing is deleted —
 * the design's pointer moves, and every other version stays exactly as it was.
 */
export function useActivateVersion(designId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) =>
      api.post<{ id: string }>(`/designs/${designId}/versions/${versionId}/activate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design', designId] });
      void queryClient.invalidateQueries({ queryKey: ['design-versions', designId] });
      void queryClient.invalidateQueries({ queryKey: ['designs'] });
    },
  });
}
