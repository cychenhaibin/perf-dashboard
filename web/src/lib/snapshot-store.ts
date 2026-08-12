import Dexie, { type Table } from "dexie"
import type { ModelSummaryComputed } from "@/lib/api"

type SnapshotRow = {
  baseUrl: string
  models: ModelSummaryComputed[]
  updatedAt: number
}

type SnapshotDB = Dexie & {
  snapshots: Table<SnapshotRow, string>
}

let dbPromise: Promise<SnapshotDB> | null = null
function getDB(): Promise<SnapshotDB> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    const db = new Dexie("perf-dashboard") as SnapshotDB
    db.version(1).stores({
      snapshots: "&baseUrl, updatedAt",
    })
    resolve(db)
  })
  return dbPromise
}

export async function writeSnapshot(
  baseUrl: string,
  models: ModelSummaryComputed[],
  updatedAt: number
): Promise<void> {
  try {
    const db = await getDB()
    await db.snapshots.put({ baseUrl, models, updatedAt })
  } catch {
    // Best-effort: storage quota / private mode failures are non-fatal.
  }
}

export async function readSnapshot(
  baseUrl: string
): Promise<{ models: ModelSummaryComputed[]; updatedAt: number } | null> {
  try {
    const db = await getDB()
    const row = await db.snapshots.get(baseUrl)
    if (!row) return null
    return { models: row.models, updatedAt: row.updatedAt }
  } catch {
    return null
  }
}
