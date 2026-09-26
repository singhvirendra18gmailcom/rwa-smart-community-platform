update public.society_service_agencies
set agency_name = 'Noida Authority',
    updated_at = now()
where service_type = 'STREET_LIGHT'
  and agency_code = 'UPPCL';
