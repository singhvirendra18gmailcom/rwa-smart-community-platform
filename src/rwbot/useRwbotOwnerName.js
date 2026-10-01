import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../supabase'

function normalizeName(value) {
  return typeof value === 'string'
    ? value.trim()
    : ''
}

function resolveFlat(profile) {
  if (!profile?.flat) {
    return null
  }

  return Array.isArray(profile.flat)
    ? profile.flat[0] || null
    : profile.flat
}

function useRwbotOwnerName(profile) {
  const flat = useMemo(
    () => resolveFlat(profile),
    [profile]
  )

  const [ownerName, setOwnerName] = useState(
    normalizeName(flat?.owner_name)
  )

  useEffect(() => {
    let cancelled = false

    const loadOwnerName = async () => {
      const embeddedOwnerName =
        normalizeName(flat?.owner_name)

      if (embeddedOwnerName) {
        setOwnerName(embeddedOwnerName)
        return
      }

      if (!flat?.id && !flat?.flat_no) {
        setOwnerName('')
        return
      }

      let query = supabase
        .from('flats')
        .select('owner_name')

      if (flat?.id) {
        query = query.eq('id', flat.id)
      } else {
        query = query.eq('flat_no', flat.flat_no)
      }

      const {
        data,
        error
      } = await query.maybeSingle()

      if (cancelled) {
        return
      }

      if (error) {
        console.warn(
          'RWBOT owner name lookup failed:',
          error
        )

        setOwnerName('')
        return
      }

      setOwnerName(
        normalizeName(data?.owner_name)
      )
    }

    loadOwnerName()

    return () => {
      cancelled = true
    }
  }, [
    flat?.id,
    flat?.flat_no,
    flat?.owner_name
  ])

  const displayName =
    ownerName ||
    normalizeName(flat?.owner_name) ||
    normalizeName(profile?.full_name) ||
    'Resident'

  return {
    flat,
    ownerName,
    displayName
  }
}

export default useRwbotOwnerName
