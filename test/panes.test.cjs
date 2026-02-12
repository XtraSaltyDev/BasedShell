const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  collapseOnClose,
  computeDepthAtNode,
  directionalNeighbor,
  findActiveSessionId,
  splitLeaf
} = require('../dist/shared/panes.js');

function leaf(sessionId) {
  return {
    type: 'leaf',
    paneId: `pane-${sessionId}`,
    sessionId
  };
}

test('splitLeaf creates a split and clamps ratio bounds', () => {
  const root = leaf('s1');
  const vertical = splitLeaf(root, 'pane-s1', 'vertical', 's2', 42);
  assert.equal(vertical.type, 'split');
  assert.equal(vertical.direction, 'vertical');
  assert.equal(vertical.ratio, MAX_SPLIT_RATIO);
  assert.equal(vertical.children[0].type, 'leaf');
  assert.equal(vertical.children[1].type, 'leaf');

  const horizontal = splitLeaf(vertical, 'pane-s2', 'horizontal', 's3', -1);
  assert.equal(horizontal.type, 'split');
  assert.equal(horizontal.children[1].type, 'split');
  assert.equal(horizontal.children[1].ratio, MIN_SPLIT_RATIO);
});

test('computeDepthAtNode reports leaf depth from root', () => {
  const root = splitLeaf(splitLeaf(leaf('s1'), 'pane-s1', 'vertical', 's2', 0.5), 'pane-s2', 'horizontal', 's3', 0.6);
  assert.equal(computeDepthAtNode(root, 'pane-s1'), 1);
  assert.equal(computeDepthAtNode(root, 'pane-s2'), 2);
  assert.equal(computeDepthAtNode(root, 'pane-s3'), 2);
  assert.equal(computeDepthAtNode(root, 'pane-missing'), null);
});

test('collapseOnClose removes the target pane and collapses ancestors', () => {
  const root = splitLeaf(splitLeaf(leaf('s1'), 'pane-s1', 'vertical', 's2', 0.5), 'pane-s2', 'horizontal', 's3', 0.6);
  const collapsed = collapseOnClose(root, 'pane-s2');
  assert.ok(collapsed);
  assert.equal(collapsed.type, 'split');
  assert.equal(findActiveSessionId(collapsed, 'pane-s3'), 's3');
  assert.equal(findActiveSessionId(collapsed, 'pane-s2'), null);
});

test('directionalNeighbor resolves nearest pane for keyboard focus travel', () => {
  const root = splitLeaf(splitLeaf(leaf('s1'), 'pane-s1', 'vertical', 's2', 0.5), 'pane-s2', 'horizontal', 's3', 0.5);
  const fromLeft = directionalNeighbor(root, 'pane-s1', 'right');
  assert.ok(fromLeft === 'pane-s2' || fromLeft === 'pane-s3');
  assert.equal(directionalNeighbor(root, 'pane-s3', 'up'), 'pane-s2');
  assert.equal(directionalNeighbor(root, 'pane-s2', 'down'), 'pane-s3');
  assert.equal(directionalNeighbor(root, 'pane-s1', 'left'), null);
});
