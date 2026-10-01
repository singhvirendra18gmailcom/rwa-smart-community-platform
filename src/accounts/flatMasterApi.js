import { supabase } from '../supabase'

const FLOOR_NAMES = {
  A: 'Ground Floor',
  B: 'First Floor',
  C: 'Second Floor',
  D: 'Third Floor'
}

export function deriveFlatDetails(value) {
  const flatNo = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '')

  const match = flatNo.match(/^(\d{1,2})([A-D])$/)
  if (!match) return null

  const unitNo = Number(match[1])
  const floorCode = match[2]

  if (unitNo < 1 || unitNo > 48) return null

  return {
    flat_no: `${unitNo}${floorCode}`,
    unit_no: unitNo,
    floor_code: floorCode,
    floor_name: FLOOR_NAMES[floorCode],
    tower_no: Math.ceil(unitNo / 4)
  }
}

export async function getFlatMaster() {
  const result = await supabase
    .from('flats')
    .select(`
      id,
      unit_no,
      floor_code,
      flat_no,
      floor_name,
      tower_no,
      owner_name,
      active
    `)
    .order('unit_no', { ascending: true })
    .order('floor_code', { ascending: true })

  if (result.error) throw result.error
  return result.data || []
}

export async function saveFlat(payload) {
  const details = deriveFlatDetails(payload.flat_no)

  if (!details) {
    throw new Error('Flat number must be between 1A and 48D, for example 1A, 12C or 36D.')
  }

  const data = {
    ...details,
    owner_name: payload.owner_name?.trim() || null,
    active: payload.active ?? true
  }

  const result = payload.id
    ? await supabase
        .from('flats')
        .update(data)
        .eq('id', payload.id)
        .select()
        .single()
    : await supabase
        .from('flats')
        .insert(data)
        .select()
        .single()

  if (result.error) throw result.error
  return result.data
}
