import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export const DEFAULT_INSPECTION_CONFIG = {
  id: 1,
  module_name: 'Society Pulse',
  theme_key: 'blue',
  report_title: 'DAILY SOCIETY INSPECTION SUMMARY',
  supervisor_contact_name: '',
  supervisor_contact_mobile: '',
  rwa_contact_name: '',
  rwa_contact_mobile: '',
}

export const INSPECTION_THEMES = {
  blue: {
    label: 'Blue',
    primary: '#176cf0',
    dark: '#173f67',
    soft: '#edf5ff',
  },
  green: {
    label: 'Green',
    primary: '#168447',
    dark: '#155d37',
    soft: '#e9f8ee',
  },
  teal: {
    label: 'Teal',
    primary: '#0f8b8d',
    dark: '#126466',
    soft: '#e8f7f7',
  },
  orange: {
    label: 'Orange',
    primary: '#d97706',
    dark: '#9a4f08',
    soft: '#fff4e6',
  },
  purple: {
    label: 'Purple',
    primary: '#7c3aed',
    dark: '#5b21b6',
    soft: '#f3edff',
  },
}

export function getInspectionTheme(themeKey) {
  return INSPECTION_THEMES[themeKey] || INSPECTION_THEMES.blue
}

export function useInspectionConfig() {
  const [config, setConfig] = useState(DEFAULT_INSPECTION_CONFIG)
  const [loading, setLoading] = useState(true)

  const loadConfig = useCallback(async () => {
    const { data, error } = await supabase
      .from('society_inspection_settings')
      .select('id,module_name,theme_key,report_title,supervisor_contact_name,supervisor_contact_mobile,rwa_contact_name,rwa_contact_mobile')
      .eq('id', 1)
      .maybeSingle()

    if (!error && data) {
      setConfig({
        ...DEFAULT_INSPECTION_CONFIG,
        ...data,
      })
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  return {
    config,
    setConfig,
    loading,
    reloadConfig: loadConfig,
  }
}
