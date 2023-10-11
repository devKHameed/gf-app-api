export type UniversalEvent = {
  id: string;
  slug: string;
  event_slug_record_type_idx: string;
  event_data: Record<string, unknown>;
  record_id: string;
  record_type: string;
  event_slug: string;
  created_at: string;
  updated_at: string;
};

export type CreateUniversalEvent = {
  accountId: string;
  recordType: string;
  recordId: string;
  eventSlug: string;
  userId: string;
  eventData: Record<string, unknown>;
};
