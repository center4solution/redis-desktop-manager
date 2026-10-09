// Builds a namespace tree from flat Redis keys split on a separator (':' by
// default), RDM-style,
// then flattens it to rows for virtualized rendering based on which
// folders are expanded.

export interface TreeNode {
  name: string
  path: string // full folder path, e.g. "user:123"
  fullKey?: string // set only on leaf nodes (actual Redis key)
  children: Map<string, TreeNode>
}

export function createRoot(): TreeNode {
  return { name: '', path: '', children: new Map() }
}

export function insertKey(root: TreeNode, key: string, sep = ':'): void {
  const parts = key.split(sep)
  let node = root
  let pathSoFar = ''

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const isLast = i === parts.length - 1
    // i === 0 rather than a truthiness check: an empty first segment (":a") is a real folder.
    pathSoFar = i === 0 ? part : `${pathSoFar}${sep}${part}`

    let child = node.children.get(part)
    if (!child) {
      child = { name: part, path: pathSoFar, children: new Map() }
      node.children.set(part, child)
    }
    if (isLast) {
      child.fullKey = key
    }
    node = child
  }
}

export interface FlatRow {
  depth: number
  name: string
  path: string
  isLeaf: boolean
  fullKey?: string
  childCount: number
}

export function flatten(
  root: TreeNode,
  expanded: Set<string>,
  filterKeyType?: (fullKey: string) => boolean
): FlatRow[] {
  const rows: FlatRow[] = []

  const visit = (node: TreeNode, depth: number): void => {
    const sortedChildren = [...node.children.values()].sort((a, b) => {
      const aIsLeaf = a.fullKey && a.children.size === 0
      const bIsLeaf = b.fullKey && b.children.size === 0
      if (aIsLeaf !== bIsLeaf) return aIsLeaf ? 1 : -1
      return a.name.localeCompare(b.name)
    })

    for (const child of sortedChildren) {
      const isLeaf = !!child.fullKey && child.children.size === 0
      if (isLeaf) {
        if (filterKeyType && child.fullKey && !filterKeyType(child.fullKey)) continue
        rows.push({
          depth,
          name: child.name,
          path: child.path,
          isLeaf: true,
          fullKey: child.fullKey,
          childCount: 0
        })
      } else {
        rows.push({
          depth,
          name: child.name,
          path: child.path,
          isLeaf: false,
          childCount: countLeaves(child)
        })
        if (expanded.has(child.path)) {
          // A key can also be a namespace prefix ("a" and "a:b"); keep it reachable.
          if (child.fullKey) {
            rows.push({
              depth: depth + 1,
              name: child.name,
              path: child.path,
              isLeaf: true,
              fullKey: child.fullKey,
              childCount: 0
            })
          }
          visit(child, depth + 1)
        }
      }
    }
  }

  visit(root, 0)
  return rows
}

function countLeaves(node: TreeNode): number {
  // Counts the node's own key (if it is one) plus every key beneath it.
  let count = node.fullKey ? 1 : 0
  for (const child of node.children.values()) count += countLeaves(child)
  return count
}

// Finds a folder node by its separator-joined path (as stored on FlatRow.path).
export function findNode(root: TreeNode, path: string, sep = ':'): TreeNode | undefined {
  let node: TreeNode | undefined = root
  for (const part of path.split(sep)) {
    node = node?.children.get(part)
    if (!node) return undefined
  }
  return node
}

// Every real key at or beneath a node (a node can itself be a key *and* a prefix).
export function collectKeys(node: TreeNode, out: string[] = []): string[] {
  if (node.fullKey) out.push(node.fullKey)
  node.children.forEach((child) => collectKeys(child, out))
  return out
}
