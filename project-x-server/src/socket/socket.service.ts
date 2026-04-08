import { status } from "../modules/solana/solana.service";

export async function verifyDriverForRider(driverPubkey: string): Promise<{
  verified: boolean
  reason?: string
}> {
  try {
    const result = await status(driverPubkey)
    if (!result.enrolled) {
      return { verified: false, reason: 'Driver not enrolled' }
    }
    if (!result.isActive) {
      return { verified: false, reason: 'Driver credential revoked' }
    }
    return { verified: true }
  } catch (e: any) {
    return { verified: false, reason: e.message }
  }
}