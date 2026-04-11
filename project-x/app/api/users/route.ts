import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export const runtime = 'nodejs'

type Role = 'driver' | 'rider'
type UsersStore = {
  driver: string | null
  rider: string | null
}

const DEFAULT_USERS: UsersStore = {
  driver: null,
  rider: null,
}

const DATA_PATH = join(process.cwd(), 'data', 'users.json')

async function ensureUsersFile(): Promise<UsersStore> {
  try {
    const raw = await readFile(DATA_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<UsersStore>

    return {
      driver: typeof parsed.driver === 'string' ? parsed.driver : null,
      rider: typeof parsed.rider === 'string' ? parsed.rider : null,
    }
  } catch {
    await mkdir(dirname(DATA_PATH), { recursive: true })
    await writeUsers(DEFAULT_USERS)
    return DEFAULT_USERS
  }
}

async function writeUsers(users: UsersStore) {
  await mkdir(dirname(DATA_PATH), { recursive: true })
  const tempPath = `${DATA_PATH}.tmp`
  await writeFile(tempPath, JSON.stringify(users, null, 2))
  await rename(tempPath, DATA_PATH)
}

export async function GET() {
  const users = await ensureUsersFile()
  return Response.json(users)
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const role = (body as { role?: unknown })?.role
  const pubkey = (body as { pubkey?: unknown })?.pubkey

  if (role !== 'driver' && role !== 'rider') {
    return Response.json({ error: 'role must be driver or rider' }, { status: 400 })
  }

  if (typeof pubkey !== 'string' || !pubkey.trim()) {
    return Response.json({ error: 'pubkey must be a non-empty string' }, { status: 400 })
  }

  const users = await ensureUsersFile()
  const updated: UsersStore = {
    ...users,
    [role]: pubkey.trim(),
  }

  await writeUsers(updated)
  return Response.json(updated)
}
