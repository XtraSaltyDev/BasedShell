export type SplitDirection = 'vertical' | 'horizontal';
export type PaneNavigationDirection = 'left' | 'right' | 'up' | 'down';

export interface PaneLeafNode {
  type: 'leaf';
  paneId: string;
  sessionId: string;
}

export interface PaneSplitNode {
  type: 'split';
  splitId: string;
  direction: SplitDirection;
  ratio: number;
  children: [PaneNode, PaneNode];
}

export type PaneNode = PaneLeafNode | PaneSplitNode;

export const MIN_SPLIT_RATIO = 0.15;
export const MAX_SPLIT_RATIO = 0.85;

interface LeafRect {
  paneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0.5;
  }

  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

export function splitLeaf(
  paneTree: PaneNode,
  targetPaneId: string,
  direction: SplitDirection,
  newSessionId: string,
  initialRatio: number
): PaneNode {
  if (paneTree.type === 'leaf') {
    if (paneTree.paneId !== targetPaneId) {
      return paneTree;
    }

    const ratio = clampRatio(initialRatio);
    const nextLeaf: PaneLeafNode = {
      type: 'leaf',
      paneId: `pane-${newSessionId}`,
      sessionId: newSessionId
    };

    return {
      type: 'split',
      splitId: `split-${newSessionId}`,
      direction,
      ratio,
      children: [paneTree, nextLeaf]
    };
  }

  const left = splitLeaf(paneTree.children[0], targetPaneId, direction, newSessionId, initialRatio);
  if (left !== paneTree.children[0]) {
    return {
      ...paneTree,
      children: [left, paneTree.children[1]]
    };
  }

  const right = splitLeaf(paneTree.children[1], targetPaneId, direction, newSessionId, initialRatio);
  if (right !== paneTree.children[1]) {
    return {
      ...paneTree,
      children: [paneTree.children[0], right]
    };
  }

  return paneTree;
}

export function collapseOnClose(paneTree: PaneNode, targetPaneId: string): PaneNode | null {
  if (paneTree.type === 'leaf') {
    return paneTree.paneId === targetPaneId ? null : paneTree;
  }

  const left = collapseOnClose(paneTree.children[0], targetPaneId);
  const right = collapseOnClose(paneTree.children[1], targetPaneId);

  if (left && right) {
    return {
      ...paneTree,
      children: [left, right]
    };
  }

  return left ?? right;
}

export function findActiveSessionId(paneTree: PaneNode, activePaneId: string): string | null {
  if (paneTree.type === 'leaf') {
    return paneTree.paneId === activePaneId ? paneTree.sessionId : null;
  }

  return (
    findActiveSessionId(paneTree.children[0], activePaneId) ??
    findActiveSessionId(paneTree.children[1], activePaneId)
  );
}

export function computeDepthAtNode(paneTree: PaneNode, targetPaneId: string): number | null {
  function walk(node: PaneNode, depth: number): number | null {
    if (node.type === 'leaf') {
      return node.paneId === targetPaneId ? depth : null;
    }

    const left = walk(node.children[0], depth + 1);
    if (left !== null) {
      return left;
    }

    return walk(node.children[1], depth + 1);
  }

  return walk(paneTree, 0);
}

export function listLeafPaneIds(paneTree: PaneNode): string[] {
  if (paneTree.type === 'leaf') {
    return [paneTree.paneId];
  }

  return [...listLeafPaneIds(paneTree.children[0]), ...listLeafPaneIds(paneTree.children[1])];
}

function collectLeafRects(node: PaneNode, x: number, y: number, width: number, height: number, out: LeafRect[]): void {
  if (node.type === 'leaf') {
    out.push({ paneId: node.paneId, x, y, width, height });
    return;
  }

  const ratio = clampRatio(node.ratio);
  if (node.direction === 'vertical') {
    const firstWidth = width * ratio;
    const secondWidth = width - firstWidth;
    collectLeafRects(node.children[0], x, y, firstWidth, height, out);
    collectLeafRects(node.children[1], x + firstWidth, y, secondWidth, height, out);
    return;
  }

  const firstHeight = height * ratio;
  const secondHeight = height - firstHeight;
  collectLeafRects(node.children[0], x, y, width, firstHeight, out);
  collectLeafRects(node.children[1], x, y + firstHeight, width, secondHeight, out);
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function centerX(rect: LeafRect): number {
  return rect.x + rect.width / 2;
}

function centerY(rect: LeafRect): number {
  return rect.y + rect.height / 2;
}

export function directionalNeighbor(
  paneTree: PaneNode,
  activePaneId: string,
  direction: PaneNavigationDirection
): string | null {
  const rects: LeafRect[] = [];
  collectLeafRects(paneTree, 0, 0, 1, 1, rects);

  const active = rects.find((rect) => rect.paneId === activePaneId);
  if (!active) {
    return null;
  }

  const activeCenterX = centerX(active);
  const activeCenterY = centerY(active);
  const epsilon = 0.0001;

  let bestPane: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of rects) {
    if (candidate.paneId === activePaneId) {
      continue;
    }

    const candidateCenterX = centerX(candidate);
    const candidateCenterY = centerY(candidate);

    let primaryDistance = 0;
    let secondaryDistance = 0;

    if (direction === 'left') {
      if (candidateCenterX >= activeCenterX - epsilon) {
        continue;
      }
      if (overlap(candidate.y, candidate.y + candidate.height, active.y, active.y + active.height) <= epsilon) {
        continue;
      }
      primaryDistance = activeCenterX - candidateCenterX;
      secondaryDistance = Math.abs(activeCenterY - candidateCenterY);
    } else if (direction === 'right') {
      if (candidateCenterX <= activeCenterX + epsilon) {
        continue;
      }
      if (overlap(candidate.y, candidate.y + candidate.height, active.y, active.y + active.height) <= epsilon) {
        continue;
      }
      primaryDistance = candidateCenterX - activeCenterX;
      secondaryDistance = Math.abs(activeCenterY - candidateCenterY);
    } else if (direction === 'up') {
      if (candidateCenterY >= activeCenterY - epsilon) {
        continue;
      }
      if (overlap(candidate.x, candidate.x + candidate.width, active.x, active.x + active.width) <= epsilon) {
        continue;
      }
      primaryDistance = activeCenterY - candidateCenterY;
      secondaryDistance = Math.abs(activeCenterX - candidateCenterX);
    } else {
      if (candidateCenterY <= activeCenterY + epsilon) {
        continue;
      }
      if (overlap(candidate.x, candidate.x + candidate.width, active.x, active.x + active.width) <= epsilon) {
        continue;
      }
      primaryDistance = candidateCenterY - activeCenterY;
      secondaryDistance = Math.abs(activeCenterX - candidateCenterX);
    }

    const score = primaryDistance * 100 + secondaryDistance;
    if (score < bestScore) {
      bestScore = score;
      bestPane = candidate.paneId;
    }
  }

  return bestPane;
}
