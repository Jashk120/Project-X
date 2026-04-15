'use client'

type CoordinatesPayload = {
  lat: number
  lng: number
  accuracy?: number
}

async function getPermissionState() {
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return null
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return null
  }
}

export async function getCurrentCoordinates(): Promise<CoordinatesPayload> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported in this browser')
  }

  const permissionState = await getPermissionState()
  if (permissionState === 'denied') {
    throw new Error('Location access is blocked. Enable location for this site in browser settings and try again.')
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : undefined,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Location access was denied. Allow location access in the browser prompt or site settings and try again.'))
          return
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error('Unable to determine device location. Check that location services are enabled on this device.'))
          return
        }

        if (error.code === error.TIMEOUT) {
          reject(new Error('Timed out while trying to get your location. Make sure location services are enabled and try again.'))
          return
        }

        reject(new Error(error.message || 'Unable to read device location'))
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      },
    )
  })
}
