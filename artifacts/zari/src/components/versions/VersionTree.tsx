import { useState } from 'react';
import { GitBranch, GitCompare, Loader2, Redo2, ShieldCheck, Undo2 } from 'lucide-react';
import { isApiConfigured } from '@/lib/config';
import { useActivateVersion, useVersionComparison, useVersionTree } from '@/hooks/useVersions';
import { formatRange } from '@/types';
import VersionCompare from './VersionCompare';
import {
  SOURCE_CHIPS,
  SOURCE_LABELS,
  compareLocally,
  layoutTree,
  newestChildOf,
  parentOf,
  versionLabel,
  whenLabel,
  type TreeRow,
  type VersionNode,
} from './types';
import '@/styles/versions.css';

/**
 * The design version tree.
 *
 * Every edit inserts a new version and keeps the one it came from, so this is a
 * tree and not a timeline: editing an older version branches rather than
 * overwrites. The screen says that out loud, because a customer who believes an
 * edit can destroy their favourite direction stops experimenting.
 *
 * Undo, redo and jump are the same operation — activate a version — and none of
 * them delete anything.
 */

/**
 * Shown when the history is the bundled demo tree rather than live data. Its own
 * copy rather than an import from App.tsx, so this component can be dropped into
 * any shell without dragging the customer chrome along with it.
 */
function DemoNote({ isLive }: { isLive: boolean }) {
  if (isLive || !isApiConfigured) return null;
  return (
    <span
      className="demo-note"
      title="The server is unreachable, so Zari is showing a sample history."
      data-testid="status-demo-data"
    >
      Sample data
    </span>
  );
}

/** The connector lines to the left of a node. Purely decorative. */
function Rail({ row }: { row: TreeRow }) {
  if (row.depth === 0) return null;
  return (
    <span className="version-rail" aria-hidden="true">
      {Array.from({ length: row.depth }).map((_, level) => {
        const isElbow = level === row.depth - 1;
        const kind = isElbow
          ? row.isLastChild
            ? 'version-rail-end'
            : 'version-rail-tee'
          : row.guides[level]
            ? 'version-rail-line'
            : 'version-rail-gap';
        return <span className={`version-rail-cell ${kind}`} key={level} />;
      })}
    </span>
  );
}

function estimateLabelFor(node: VersionNode): string {
  const estimate = node.costEstimate;
  if (!estimate) return 'Not priced yet';
  return formatRange(estimate.minTotal, estimate.maxTotal);
}

export default function VersionTree({ designId }: { designId: string }) {
  const { data: tree, isLive, isLoading } = useVersionTree(designId);
  const activate = useActivateVersion(designId);

  const [comparing, setComparing] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // Only used when the API is unreachable: the demo history still moves so the
  // behaviour is legible, but it is never presented as saved.
  const [demoCurrentId, setDemoCurrentId] = useState<string | null>(null);

  const versions = tree.versions;
  const rows = layoutTree(versions);

  const currentId = (isLive ? tree.currentVersionId : (demoCurrentId ?? tree.currentVersionId)) ?? null;
  const current = versions.find((v) => v.id === currentId) ?? null;

  const undoTarget = parentOf(versions, current);
  const redoTarget = newestChildOf(versions, current);

  const [aId, bId] = [picks[0] ?? null, picks[1] ?? null];
  const pickedA = aId ? (versions.find((v) => v.id === aId) ?? null) : null;
  const pickedB = bId ? (versions.find((v) => v.id === bId) ?? null) : null;
  const localComparison = pickedA && pickedB ? compareLocally(pickedA, pickedB) : null;
  const {
    data: comparison,
    isLoading: comparisonLoading,
    isLive: comparisonIsLive,
  } = useVersionComparison(designId, aId, bId, localComparison);

  const move = (versionId: string, phrasing: string) => {
    if (versionId === currentId) return;
    const target = versions.find((v) => v.id === versionId);
    const label = target ? versionLabel(target.versionNumber) : 'that version';

    if (!isLive) {
      setDemoCurrentId(versionId);
      setNote(`${phrasing} ${label}. This is the sample history, so nothing was saved.`);
      return;
    }

    activate.mutate(versionId, {
      onSuccess: () => setNote(`${phrasing} ${label}. Every other version is still here.`),
      onError: () =>
        setNote("Zari couldn't move to that version. Nothing is lost — try again."),
    });
  };

  const onNodeClick = (node: VersionNode) => {
    if (!comparing) {
      move(node.id, 'Now showing');
      return;
    }
    setPicks((chosen) =>
      chosen.includes(node.id)
        ? chosen.filter((id) => id !== node.id)
        : [...chosen, node.id].slice(-2),
    );
  };

  const toggleCompare = () => {
    setComparing((on) => !on);
    setPicks([]);
    setNote(comparing ? null : 'Pick two versions to see what changed between them.');
  };

  const pickLabel = (id: string): string | null => {
    if (!comparing) return null;
    if (id === aId) return 'COMPARING · FIRST';
    if (id === bId) return 'COMPARING · SECOND';
    return null;
  };

  return (
    <div className="surface studio-card version-tree" data-testid="card-version-tree">
      <div className="version-tree-head">
        <div>
          <div className="eyebrow">
            Version history{isLoading ? ' · loading' : ''} <DemoNote isLive={isLive} />
          </div>
          <h3>Every direction you have taken.</h3>
          <p className="muted version-reassure">
            Nothing here is ever overwritten. An edit adds a new version and keeps the one it came
            from, so you can go back — or start again from an older idea — whenever you want.
          </p>
        </div>

        <div className="version-controls">
          <button
            className="button button-ghost"
            onClick={() => undoTarget && move(undoTarget.id, 'Back to')}
            disabled={!undoTarget || activate.isPending}
            title={
              undoTarget
                ? `Go back to ${versionLabel(undoTarget.versionNumber)}`
                : 'This is where the design started — there is nothing before it.'
            }
            data-testid="button-version-undo"
          >
            <Undo2 size={14} /> Undo
            {undoTarget ? <small className="mono">{versionLabel(undoTarget.versionNumber)}</small> : null}
          </button>

          <button
            className="button button-ghost"
            onClick={() => redoTarget && move(redoTarget.id, 'Forward to')}
            disabled={!redoTarget || activate.isPending}
            title={
              redoTarget
                ? `Go forward to ${versionLabel(redoTarget.versionNumber)}`
                : 'Nothing has been made from this version yet.'
            }
            data-testid="button-version-redo"
          >
            <Redo2 size={14} /> Redo
            {redoTarget ? <small className="mono">{versionLabel(redoTarget.versionNumber)}</small> : null}
          </button>

          <button
            className={`button ${comparing ? 'button-primary' : 'button-ghost'}`}
            onClick={toggleCompare}
            data-testid="button-version-compare-mode"
          >
            <GitCompare size={14} /> {comparing ? 'Stop comparing' : 'Compare'}
          </button>
        </div>
      </div>

      {activate.isPending ? (
        <p className="version-status muted" role="status" data-testid="status-version-moving">
          <Loader2 size={13} className="spin" /> Moving to that version…
        </p>
      ) : note ? (
        <p className="version-status" role="status" data-testid="status-version-note">
          {note}
        </p>
      ) : null}

      {comparing && !comparison ? (
        <p className="version-status muted" data-testid="status-version-compare-hint">
          {picks.length === 0
            ? 'Pick the version to compare from.'
            : 'Now pick the version to compare it with.'}
        </p>
      ) : null}

      {comparison ? (
        <VersionCompare
          comparison={comparison}
          isLoading={comparisonLoading}
          // Live history but a comparison that fell back means the diff itself
          // is missing — say so rather than claim the versions are identical.
          detailsAvailable={!isLive || comparisonIsLive}
          onClear={() => {
            setPicks([]);
            setComparing(false);
            setNote(null);
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <div className="empty-state" data-testid="card-version-tree-empty">
          <GitBranch size={23} />
          <h3>This design has no versions yet.</h3>
          <p>Ask Zari for a change and the first one appears here.</p>
        </div>
      ) : (
        <ol className="version-rows">
          {rows.map((row) => {
            const { node } = row;
            const isCurrent = node.id === currentId;
            const picked = pickLabel(node.id);

            return (
              <li className="version-row" key={node.id}>
                <Rail row={row} />
                <button
                  type="button"
                  className={`version-node${isCurrent ? ' current' : ''}${picked ? ' picked' : ''}`}
                  onClick={() => onNodeClick(node)}
                  aria-pressed={comparing ? Boolean(picked) : isCurrent}
                  aria-label={
                    comparing
                      ? `Pick version ${node.versionNumber} to compare`
                      : `Show version ${node.versionNumber}`
                  }
                  data-testid={`button-version-${node.versionNumber}`}
                >
                  <span className="version-node-top">
                    <span className="version-number mono">{versionLabel(node.versionNumber)}</span>
                    <span className="version-source">{SOURCE_CHIPS[node.source]}</span>
                    {isCurrent ? <span className="status-pill">CURRENT</span> : null}
                    {picked ? <span className="status-pill">{picked}</span> : null}
                    {node.isManufacturable ? null : (
                      <span className="status-pill">NEEDS A RETHINK</span>
                    )}
                  </span>

                  <span className="version-made-by">{SOURCE_LABELS[node.source]}</span>

                  {node.editInstruction ? (
                    <span className="version-instruction">“{node.editInstruction}”</span>
                  ) : null}

                  {node.aiSummary ? (
                    <span className="version-summary muted">{node.aiSummary}</span>
                  ) : null}

                  <span className="version-node-foot">
                    <span className="mono">{estimateLabelFor(node)}</span>
                    <span className="muted">{whenLabel(node.createdAt)}</span>
                  </span>

                  {row.branchIndex > 0 && row.parentNumber !== null ? (
                    <span className="version-branch-note">
                      <GitBranch size={12} /> Branched from {versionLabel(row.parentNumber)}, which is
                      still exactly as it was
                    </span>
                  ) : null}

                  {row.childCount > 1 ? (
                    <span className="version-branch-note">
                      <GitBranch size={12} /> {row.childCount} directions start here
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="version-foot muted">
        <ShieldCheck size={13} />
        {versions.length === 1
          ? 'One version so far. Every edit you make keeps it.'
          : `${versions.length} versions kept. Moving between them changes nothing but what you are looking at.`}
      </p>
    </div>
  );
}
