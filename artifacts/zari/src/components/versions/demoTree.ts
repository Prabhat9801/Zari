import type { VersionNode, VersionTreeData } from './types';

/**
 * The version history shown when the API is unreachable.
 *
 * It is deliberately a *tree*, not a straight line: version 4 is a budget plan
 * taken off version 2, so versions 3 and 4 are two live directions from the same
 * parent. A flat demo would hide the one behaviour this screen exists to show.
 *
 *   v01  first direction
 *    └── v02  full sleeves
 *         ├── v03  more pearlwork            ← the richer branch
 *         │    └── v06  designer's proposal
 *         └── v04  budget plan               ← branched off v02, not off v03
 *              └── v05  scalloped hem, same budget
 */

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

export const demoVersions: VersionNode[] = [
  {
    id: 'version-01',
    versionNumber: 1,
    parentVersionId: null,
    source: 'GENERATION',
    editInstruction: null,
    aiSummary: 'A flared A-line lehenga in chanderi silk with resham thread across the hem.',
    isManufacturable: true,
    createdAt: ago(3 * 24 * 60),
    costEstimate: { minTotal: 740_000, maxTotal: 840_000, confidence: 'MEDIUM' },
    spec: {
      silhouette: 'Flared A-line',
      fabric: 'Chanderi silk',
      lining: 'Cotton mul',
      neckline: 'Sweetheart',
      sleeves: 'Cap',
      embroidery: 'Resham thread',
      motifDensity: 'Medium',
      hemline: 'Straight',
    },
  },
  {
    id: 'version-02',
    versionNumber: 2,
    parentVersionId: 'version-01',
    source: 'EDIT',
    editInstruction: 'Make the sleeves full length and keep the neckline as it is.',
    aiSummary: 'Full sleeves add ₹340 in fabric and a little hand-finishing at the cuff.',
    isManufacturable: true,
    createdAt: ago(2 * 24 * 60 + 90),
    costEstimate: { minTotal: 782_000, maxTotal: 889_000, confidence: 'MEDIUM' },
    spec: {
      silhouette: 'Flared A-line',
      fabric: 'Chanderi silk',
      lining: 'Cotton mul',
      neckline: 'Sweetheart',
      sleeves: 'Full length',
      embroidery: 'Resham thread',
      motifDensity: 'Medium',
      hemline: 'Straight',
    },
  },
  {
    id: 'version-03',
    versionNumber: 3,
    parentVersionId: 'version-02',
    source: 'EDIT',
    editInstruction: 'More pearlwork along the dupatta border.',
    aiSummary: 'Pearlwork on the border adds ₹620 and two days of hand-finishing.',
    isManufacturable: true,
    createdAt: ago(2 * 24 * 60),
    costEstimate: { minTotal: 861_000, maxTotal: 974_000, confidence: 'MEDIUM' },
    spec: {
      silhouette: 'Flared A-line',
      fabric: 'Chanderi silk',
      lining: 'Cotton mul',
      neckline: 'Sweetheart',
      sleeves: 'Full length',
      embroidery: 'Resham and pearl',
      motifDensity: 'Dense',
      hemline: 'Straight',
    },
  },
  {
    id: 'version-04',
    versionNumber: 4,
    parentVersionId: 'version-02',
    source: 'BUDGET_PLAN',
    editInstruction: 'Bring this to ₹6,500 without losing the drape.',
    aiSummary: 'A chanderi blend and a simpler lining hold the silhouette at a lower rate.',
    isManufacturable: true,
    createdAt: ago(26 * 60),
    costEstimate: { minTotal: 598_000, maxTotal: 662_000, confidence: 'MEDIUM' },
    spec: {
      silhouette: 'Flared A-line',
      fabric: 'Chanderi blend',
      lining: 'Poly-cotton',
      neckline: 'Sweetheart',
      sleeves: 'Full length',
      embroidery: 'Resham thread',
      motifDensity: 'Medium',
      hemline: 'Straight',
    },
  },
  {
    id: 'version-05',
    versionNumber: 5,
    parentVersionId: 'version-04',
    source: 'EDIT',
    editInstruction: 'Keep the budget, but bring back the scalloped hem.',
    aiSummary: 'A scalloped hem is cutting work rather than material, so it adds ₹260.',
    isManufacturable: true,
    createdAt: ago(4 * 60),
    costEstimate: { minTotal: 624_000, maxTotal: 698_000, confidence: 'MEDIUM' },
    spec: {
      silhouette: 'Flared A-line',
      fabric: 'Chanderi blend',
      lining: 'Poly-cotton',
      neckline: 'Sweetheart',
      sleeves: 'Full length',
      embroidery: 'Resham thread',
      motifDensity: 'Medium',
      hemline: 'Scalloped',
    },
  },
  {
    id: 'version-06',
    versionNumber: 6,
    parentVersionId: 'version-03',
    source: 'DESIGNER_PROPOSAL',
    editInstruction: 'Aanya Studio suggested handloom chanderi for a better fall.',
    aiSummary: 'Handloom chanderi drapes heavier and adds four days to the lead time.',
    isManufacturable: true,
    createdAt: ago(70),
    costEstimate: { minTotal: 848_000, maxTotal: 952_000, confidence: 'LOW' },
    spec: {
      silhouette: 'Flared A-line',
      fabric: 'Handloom chanderi silk',
      lining: 'Cotton mul',
      neckline: 'Sweetheart',
      sleeves: 'Full length',
      embroidery: 'Resham and pearl',
      motifDensity: 'Dense',
      hemline: 'Straight',
    },
  },
];

/** Version 4 is current, so undo and redo both have somewhere to go. */
export const demoVersionTree: VersionTreeData = {
  currentVersionId: 'version-04',
  versions: demoVersions,
};
