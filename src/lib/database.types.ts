
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "admin_employer_layer_events": {
                  Row: {
                    "action": string,"admin_user_id": string,"id": string,"performed_at": string,"practice_id": string,"reason": string | null,"summary": NonNullable<Json>
                  }
                  Insert: {
                    "action": string,"admin_user_id": string,"id"?: string,"performed_at"?: string,"practice_id": string,"reason"?: string | null,"summary"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"admin_user_id"?: string,"id"?: string,"performed_at"?: string,"practice_id"?: string,"reason"?: string | null,"summary"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_employer_layer_events_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"affiliations": {
                  Row: {
                    "city_st": string | null,"created_at": string | null,"doctor_id": string,"first_seen_year_at_org": number | null,"grad_yr": number | null,"id": string,"last_seen_year_at_org": number | null,"npi": string | null,"practice_id": string,"status": string | null,"tenure_years": number | null
                  }
                  Insert: {
                    "city_st"?: string | null,"created_at"?: string | null,"doctor_id": string,"first_seen_year_at_org"?: number | null,"grad_yr"?: number | null,"id"?: string,"last_seen_year_at_org"?: number | null,"npi"?: string | null,"practice_id": string,"status"?: string | null,"tenure_years"?: number | null
                  }
                  Update: {
                    "city_st"?: string | null,"created_at"?: string | null,"doctor_id"?: string,"first_seen_year_at_org"?: number | null,"grad_yr"?: number | null,"id"?: string,"last_seen_year_at_org"?: number | null,"npi"?: string | null,"practice_id"?: string,"status"?: string | null,"tenure_years"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "affiliations_doctor_id_fkey"
      columns: ["doctor_id"]
isOneToOne: false
      referencedRelation: "doctors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "affiliations_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"connect_employer_email_outbox": {
                  Row: {
                    "body": string,"created_at": string,"dedupe_key": string,"deep_link": string,"email_kind": string,"error_detail": string | null,"id": string,"payload": NonNullable<Json>,"practice_id": string,"provider_message_id": string | null,"recipient_email": string,"recipient_user_id": string,"relationship_id": string,"sent_at": string | null,"status": string,"title": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"dedupe_key": string,"deep_link": string,"email_kind": string,"error_detail"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"practice_id": string,"provider_message_id"?: string | null,"recipient_email": string,"recipient_user_id": string,"relationship_id": string,"sent_at"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dedupe_key"?: string,"deep_link"?: string,"email_kind"?: string,"error_detail"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"practice_id"?: string,"provider_message_id"?: string | null,"recipient_email"?: string,"recipient_user_id"?: string,"relationship_id"?: string,"sent_at"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connect_employer_email_outbox_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connect_employer_email_outbox_relationship_id_fkey"
      columns: ["relationship_id"]
isOneToOne: false
      referencedRelation: "connect_relationships"
      referencedColumns: ["id"]
    }
                  ]
                },"connect_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"is_intro": boolean,"relationship_id": string,"sender_side": string,"sender_user_id": string | null
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"is_intro"?: boolean,"relationship_id": string,"sender_side": string,"sender_user_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"is_intro"?: boolean,"relationship_id"?: string,"sender_side"?: string,"sender_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "connect_messages_relationship_id_fkey"
      columns: ["relationship_id"]
isOneToOne: false
      referencedRelation: "connect_relationships"
      referencedColumns: ["id"]
    }
                  ]
                },"connect_participant_read_state": {
                  Row: {
                    "last_read_at": string,"last_read_message_id": string | null,"participant_side": string,"relationship_id": string
                  }
                  Insert: {
                    "last_read_at"?: string,"last_read_message_id"?: string | null,"participant_side": string,"relationship_id": string
                  }
                  Update: {
                    "last_read_at"?: string,"last_read_message_id"?: string | null,"participant_side"?: string,"relationship_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connect_participant_read_state_last_read_message_id_fkey"
      columns: ["last_read_message_id"]
isOneToOne: false
      referencedRelation: "connect_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connect_participant_read_state_relationship_id_fkey"
      columns: ["relationship_id"]
isOneToOne: false
      referencedRelation: "connect_relationships"
      referencedColumns: ["id"]
    }
                  ]
                },"connect_relationship_events": {
                  Row: {
                    "actor_side": string,"actor_user_id": string | null,"created_at": string,"event_type": string,"id": string,"metadata": NonNullable<Json>,"relationship_id": string
                  }
                  Insert: {
                    "actor_side": string,"actor_user_id"?: string | null,"created_at"?: string,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"relationship_id": string
                  }
                  Update: {
                    "actor_side"?: string,"actor_user_id"?: string | null,"created_at"?: string,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"relationship_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connect_relationship_events_relationship_id_fkey"
      columns: ["relationship_id"]
isOneToOne: false
      referencedRelation: "connect_relationships"
      referencedColumns: ["id"]
    }
                  ]
                },"connect_relationships": {
                  Row: {
                    "canceled_at": string | null,"canceled_by_user_id": string | null,"created_at": string,"disconnected_at": string | null,"disconnected_by_side": string | null,"disconnected_by_user_id": string | null,"id": string,"initiated_by_user_id": string,"initiator_side": string,"opportunity_id": string | null,"organization_id": string | null,"physician_profile_id": string,"practice_id": string,"responded_at": string | null,"responded_by_user_id": string | null,"status": string,"updated_at": string,"_connect_viewer_side": string | null
                  }
                  Insert: {
                    "canceled_at"?: string | null,"canceled_by_user_id"?: string | null,"created_at"?: string,"disconnected_at"?: string | null,"disconnected_by_side"?: string | null,"disconnected_by_user_id"?: string | null,"id"?: string,"initiated_by_user_id": string,"initiator_side": string,"opportunity_id"?: string | null,"organization_id"?: string | null,"physician_profile_id": string,"practice_id": string,"responded_at"?: string | null,"responded_by_user_id"?: string | null,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "canceled_at"?: string | null,"canceled_by_user_id"?: string | null,"created_at"?: string,"disconnected_at"?: string | null,"disconnected_by_side"?: string | null,"disconnected_by_user_id"?: string | null,"id"?: string,"initiated_by_user_id"?: string,"initiator_side"?: string,"opportunity_id"?: string | null,"organization_id"?: string | null,"physician_profile_id"?: string,"practice_id"?: string,"responded_at"?: string | null,"responded_by_user_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "connect_relationships_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "employer_practice_recruiting_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connect_relationships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "employer_organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connect_relationships_physician_profile_id_fkey"
      columns: ["physician_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "connect_relationships_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"doctors": {
                  Row: {
                    "created_at": string | null,"id": string,"npi": string | null,"physician_name": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"npi"?: string | null,"physician_name"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"npi"?: string | null,"physician_name"?: string | null
                  }
                  Relationships: [

                  ]
                },"employer_leads": {
                  Row: {
                    "additional_details": string | null,"airtable_id": string | null,"clinical_surgical_mix": string | null,"created_at": string | null,"email": string | null,"id": string,"ideal_hiring_timeline": string | null,"is_published": boolean,"message_id": string | null,"phone": string | null,"point_of_contact": string | null,"practice_id": string | null,"practice_name": string | null,"practice_setting": string | null,"primary_location": string | null,"received_at": string | null,"source": string | null,"subspecialties_interest": (string)[] | null,"updated_at": string | null
                  }
                  Insert: {
                    "additional_details"?: string | null,"airtable_id"?: string | null,"clinical_surgical_mix"?: string | null,"created_at"?: string | null,"email"?: string | null,"id"?: string,"ideal_hiring_timeline"?: string | null,"is_published"?: boolean,"message_id"?: string | null,"phone"?: string | null,"point_of_contact"?: string | null,"practice_id"?: string | null,"practice_name"?: string | null,"practice_setting"?: string | null,"primary_location"?: string | null,"received_at"?: string | null,"source"?: string | null,"subspecialties_interest"?: (string)[] | null,"updated_at"?: string | null
                  }
                  Update: {
                    "additional_details"?: string | null,"airtable_id"?: string | null,"clinical_surgical_mix"?: string | null,"created_at"?: string | null,"email"?: string | null,"id"?: string,"ideal_hiring_timeline"?: string | null,"is_published"?: boolean,"message_id"?: string | null,"phone"?: string | null,"point_of_contact"?: string | null,"practice_id"?: string | null,"practice_name"?: string | null,"practice_setting"?: string | null,"primary_location"?: string | null,"received_at"?: string | null,"source"?: string | null,"subspecialties_interest"?: (string)[] | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_leads_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_leads_clinical_focus_map": {
                  Row: {
                    "clinical_focus": string,"lead_specialty": string
                  }
                  Insert: {
                    "clinical_focus": string,"lead_specialty": string
                  }
                  Update: {
                    "clinical_focus"?: string,"lead_specialty"?: string
                  }
                  Relationships: [

                  ]
                },"employer_notifications": {
                  Row: {
                    "body": string,"created_at": string,"dedupe_key": string,"deep_link": string,"id": string,"notification_type": string,"payload": NonNullable<Json>,"practice_id": string,"read_at": string | null,"recipient_user_id": string,"relationship_id": string | null,"title": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"dedupe_key": string,"deep_link": string,"id"?: string,"notification_type": string,"payload"?: NonNullable<Json>,"practice_id": string,"read_at"?: string | null,"recipient_user_id": string,"relationship_id"?: string | null,"title": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dedupe_key"?: string,"deep_link"?: string,"id"?: string,"notification_type"?: string,"payload"?: NonNullable<Json>,"practice_id"?: string,"read_at"?: string | null,"recipient_user_id"?: string,"relationship_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_notifications_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_notifications_relationship_id_fkey"
      columns: ["relationship_id"]
isOneToOne: false
      referencedRelation: "connect_relationships"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_organization_practices": {
                  Row: {
                    "approved_at": string,"approved_by": string,"created_at": string,"id": string,"inactive_at": string | null,"inactive_reason": string | null,"organization_id": string,"practice_id": string,"relationship": string,"status": string
                  }
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"created_at"?: string,"id"?: string,"inactive_at"?: string | null,"inactive_reason"?: string | null,"organization_id": string,"practice_id": string,"relationship"?: string,"status"?: string
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"created_at"?: string,"id"?: string,"inactive_at"?: string | null,"inactive_reason"?: string | null,"organization_id"?: string,"practice_id"?: string,"relationship"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_organization_practices_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "employer_organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_organization_practices_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_organizations": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"parent_organization_id": string | null,"slug": string,"status": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"parent_organization_id"?: string | null,"slug": string,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"parent_organization_id"?: string | null,"slug"?: string,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_organizations_parent_organization_id_fkey"
      columns: ["parent_organization_id"]
isOneToOne: false
      referencedRelation: "employer_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_infrastructure": {
                  Row: {
                    "category_id": string,"created_at": string,"id": string,"last_confirmed_at": string | null,"other_vendor_name": string | null,"practice_id": string,"reported_at": string,"reported_by": string | null,"updated_at": string,"vendor_id": string | null,"vendor_product_id": string | null
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"id"?: string,"last_confirmed_at"?: string | null,"other_vendor_name"?: string | null,"practice_id": string,"reported_at"?: string,"reported_by"?: string | null,"updated_at"?: string,"vendor_id"?: string | null,"vendor_product_id"?: string | null
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"id"?: string,"last_confirmed_at"?: string | null,"other_vendor_name"?: string | null,"practice_id"?: string,"reported_at"?: string,"reported_by"?: string | null,"updated_at"?: string,"vendor_id"?: string | null,"vendor_product_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_infrastructure_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "infrastructure_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_practice_infrastructure_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_practice_infrastructure_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_practice_infrastructure_vendor_product_id_fkey"
      columns: ["vendor_product_id"]
isOneToOne: false
      referencedRelation: "vendor_products"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_infrastructure_category_reviews": {
                  Row: {
                    "category_id": string,"created_at": string,"id": string,"last_confirmed_at": string | null,"practice_id": string,"reported_at": string,"reported_by": string | null,"review_state": string,"updated_at": string
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"id"?: string,"last_confirmed_at"?: string | null,"practice_id": string,"reported_at"?: string,"reported_by"?: string | null,"review_state": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"id"?: string,"last_confirmed_at"?: string | null,"practice_id"?: string,"reported_at"?: string,"reported_by"?: string | null,"review_state"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_infrastructure_category_revi_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "infrastructure_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_practice_infrastructure_category_revi_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_locations": {
                  Row: {
                    "address": string | null,"city": string,"created_at": string,"id": string,"is_primary": boolean,"phone": string | null,"practice_id": string,"source_location_id": string | null,"state": string,"status": string,"updated_at": string,"updated_by": string | null,"zip": string | null
                  }
                  Insert: {
                    "address"?: string | null,"city": string,"created_at"?: string,"id"?: string,"is_primary"?: boolean,"phone"?: string | null,"practice_id": string,"source_location_id"?: string | null,"state": string,"status": string,"updated_at"?: string,"updated_by"?: string | null,"zip"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"city"?: string,"created_at"?: string,"id"?: string,"is_primary"?: boolean,"phone"?: string | null,"practice_id"?: string,"source_location_id"?: string | null,"state"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"zip"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_locations_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_practice_locations_source_location_id_fkey"
      columns: ["source_location_id"]
isOneToOne: false
      referencedRelation: "practice_locations"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_preview_tokens": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"practice_id": string,"token_hash": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"practice_id": string,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"practice_id"?: string,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_preview_tokens_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_profiles": {
                  Row: {
                    "careers_url": string | null,"created_at": string,"display_name_proposed_at": string | null,"display_name_proposed_by": string | null,"display_name_rejection_reason": string | null,"display_name_reviewed_at": string | null,"display_name_reviewed_by": string | null,"future_practice_description": string | null,"infrastructure_last_reviewed_at": string | null,"infrastructure_last_reviewed_by": string | null,"initial_review_completed_at": string | null,"initial_review_completed_by": string | null,"logo_storage_path": string | null,"overview": string | null,"physician_fit_description": string | null,"physician_ready_at": string | null,"physician_ready_by": string | null,"practice_id": string,"practice_ownership_other_text": string | null,"practice_ownership_structure": string | null,"primary_phone": string | null,"proposed_display_name": string | null,"public_display_name": string | null,"recruiting_contact_name": string | null,"recruiting_email": string | null,"recruiting_phone": string | null,"roster_last_reviewed_at": string | null,"roster_last_reviewed_by": string | null,"updated_at": string,"updated_by": string | null,"website": string | null
                  }
                  Insert: {
                    "careers_url"?: string | null,"created_at"?: string,"display_name_proposed_at"?: string | null,"display_name_proposed_by"?: string | null,"display_name_rejection_reason"?: string | null,"display_name_reviewed_at"?: string | null,"display_name_reviewed_by"?: string | null,"future_practice_description"?: string | null,"infrastructure_last_reviewed_at"?: string | null,"infrastructure_last_reviewed_by"?: string | null,"initial_review_completed_at"?: string | null,"initial_review_completed_by"?: string | null,"logo_storage_path"?: string | null,"overview"?: string | null,"physician_fit_description"?: string | null,"physician_ready_at"?: string | null,"physician_ready_by"?: string | null,"practice_id": string,"practice_ownership_other_text"?: string | null,"practice_ownership_structure"?: string | null,"primary_phone"?: string | null,"proposed_display_name"?: string | null,"public_display_name"?: string | null,"recruiting_contact_name"?: string | null,"recruiting_email"?: string | null,"recruiting_phone"?: string | null,"roster_last_reviewed_at"?: string | null,"roster_last_reviewed_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "careers_url"?: string | null,"created_at"?: string,"display_name_proposed_at"?: string | null,"display_name_proposed_by"?: string | null,"display_name_rejection_reason"?: string | null,"display_name_reviewed_at"?: string | null,"display_name_reviewed_by"?: string | null,"future_practice_description"?: string | null,"infrastructure_last_reviewed_at"?: string | null,"infrastructure_last_reviewed_by"?: string | null,"initial_review_completed_at"?: string | null,"initial_review_completed_by"?: string | null,"logo_storage_path"?: string | null,"overview"?: string | null,"physician_fit_description"?: string | null,"physician_ready_at"?: string | null,"physician_ready_by"?: string | null,"practice_id"?: string,"practice_ownership_other_text"?: string | null,"practice_ownership_structure"?: string | null,"primary_phone"?: string | null,"proposed_display_name"?: string | null,"public_display_name"?: string | null,"recruiting_contact_name"?: string | null,"recruiting_email"?: string | null,"recruiting_phone"?: string | null,"roster_last_reviewed_at"?: string | null,"roster_last_reviewed_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_profiles_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: true
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_recruiting_opportunities": {
                  Row: {
                    "base_compensation_max_is_open_ended": boolean,"base_compensation_max_usd": number | null,"base_compensation_min_usd": number,"clinical_focus": string,"created_at": string,"hiring_horizon": string,"hiring_notes": string | null,"id": string,"last_confirmed_at": string | null,"practice_id": string,"productivity_structure_available": boolean,"relocation_assistance_available": boolean,"reported_at": string,"reported_by": string | null,"signing_bonus_available": boolean,"updated_at": string
                  }
                  Insert: {
                    "base_compensation_max_is_open_ended"?: boolean,"base_compensation_max_usd"?: number | null,"base_compensation_min_usd": number,"clinical_focus": string,"created_at"?: string,"hiring_horizon": string,"hiring_notes"?: string | null,"id"?: string,"last_confirmed_at"?: string | null,"practice_id": string,"productivity_structure_available": boolean,"relocation_assistance_available": boolean,"reported_at"?: string,"reported_by"?: string | null,"signing_bonus_available": boolean,"updated_at"?: string
                  }
                  Update: {
                    "base_compensation_max_is_open_ended"?: boolean,"base_compensation_max_usd"?: number | null,"base_compensation_min_usd"?: number,"clinical_focus"?: string,"created_at"?: string,"hiring_horizon"?: string,"hiring_notes"?: string | null,"id"?: string,"last_confirmed_at"?: string | null,"practice_id"?: string,"productivity_structure_available"?: boolean,"relocation_assistance_available"?: boolean,"reported_at"?: string,"reported_by"?: string | null,"signing_bonus_available"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_recruiting_opportunities_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_practice_recruiting_opportunity_reasons": {
                  Row: {
                    "created_at": string,"id": string,"opportunity_id": string,"other_text": string | null,"reason": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"opportunity_id": string,"other_text"?: string | null,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"opportunity_id"?: string,"other_text"?: string | null,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_practice_recruiting_opportunity_re_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "employer_practice_recruiting_opportunities"
      referencedColumns: ["id"]
    }
                  ]
                },"employer_roster_assertions": {
                  Row: {
                    "affiliation_id": string | null,"asserted_at": string,"asserted_by": string,"assertion": string,"cms_confirmed_at": string | null,"comment": string | null,"doctor_id": string,"effective_month": number | null,"effective_year": number | null,"id": string,"practice_id": string,"status": string,"supersedes_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "affiliation_id"?: string | null,"asserted_at"?: string,"asserted_by": string,"assertion": string,"cms_confirmed_at"?: string | null,"comment"?: string | null,"doctor_id": string,"effective_month"?: number | null,"effective_year"?: number | null,"id"?: string,"practice_id": string,"status"?: string,"supersedes_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "affiliation_id"?: string | null,"asserted_at"?: string,"asserted_by"?: string,"assertion"?: string,"cms_confirmed_at"?: string | null,"comment"?: string | null,"doctor_id"?: string,"effective_month"?: number | null,"effective_year"?: number | null,"id"?: string,"practice_id"?: string,"status"?: string,"supersedes_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employer_roster_assertions_affiliation_id_fkey"
      columns: ["affiliation_id"]
isOneToOne: false
      referencedRelation: "affiliations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_roster_assertions_doctor_id_fkey"
      columns: ["doctor_id"]
isOneToOne: false
      referencedRelation: "doctors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_roster_assertions_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employer_roster_assertions_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "employer_roster_assertions"
      referencedColumns: ["id"]
    }
                  ]
                },"infrastructure_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"display_label": string,"id": string,"physician_facing": boolean,"slug": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_label": string,"id"?: string,"physician_facing"?: boolean,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_label"?: string,"id"?: string,"physician_facing"?: boolean,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"opportunity_notification_snapshots": {
                  Row: {
                    "base_compensation_max_is_open_ended": boolean,"base_compensation_max_usd": number | null,"base_compensation_min_usd": number,"clinical_focus": string,"first_visible_at": string | null,"hiring_horizon": string,"last_material_version": number,"opportunity_id": string,"practice_id": string,"updated_at": string
                  }
                  Insert: {
                    "base_compensation_max_is_open_ended"?: boolean,"base_compensation_max_usd"?: number | null,"base_compensation_min_usd": number,"clinical_focus": string,"first_visible_at"?: string | null,"hiring_horizon": string,"last_material_version"?: number,"opportunity_id": string,"practice_id": string,"updated_at"?: string
                  }
                  Update: {
                    "base_compensation_max_is_open_ended"?: boolean,"base_compensation_max_usd"?: number | null,"base_compensation_min_usd"?: number,"clinical_focus"?: string,"first_visible_at"?: string | null,"hiring_horizon"?: string,"last_material_version"?: number,"opportunity_id"?: string,"practice_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_notification_snapshots_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: true
      referencedRelation: "employer_practice_recruiting_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunity_notification_snapshots_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_memberships": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"id": string,"invited_at": string | null,"invited_by": string | null,"organization_id": string,"revoked_at": string | null,"revoked_by": string | null,"role": string,"scope": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"id"?: string,"invited_at"?: string | null,"invited_by"?: string | null,"organization_id": string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role": string,"scope"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"id"?: string,"invited_at"?: string | null,"invited_by"?: string | null,"organization_id"?: string,"revoked_at"?: string | null,"revoked_by"?: string | null,"role"?: string,"scope"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "employer_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "confidence": string | null,"created_at": string | null,"id": string,"name": string,"notes": string | null,"org_type": string | null,"ownership_source": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "confidence"?: string | null,"created_at"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"org_type"?: string | null,"ownership_source"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "confidence"?: string | null,"created_at"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"org_type"?: string | null,"ownership_source"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [

                  ]
                },"physician_notification_email_batches": {
                  Row: {
                    "batch_kind": string,"created_at": string,"error_detail": string | null,"id": string,"physician_profile_id": string,"provider_message_id": string | null,"sent_at": string | null,"status": string
                  }
                  Insert: {
                    "batch_kind": string,"created_at"?: string,"error_detail"?: string | null,"id"?: string,"physician_profile_id": string,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "batch_kind"?: string,"created_at"?: string,"error_detail"?: string | null,"id"?: string,"physician_profile_id"?: string,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "physician_notification_email_batches_physician_profile_id_fkey"
      columns: ["physician_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"physician_notifications": {
                  Row: {
                    "body": string,"created_at": string,"dedupe_key": string,"deep_link": string,"delivery_channel": string,"destination_id": string | null,"destination_type": string,"email_batch_id": string | null,"emailed_at": string | null,"id": string,"notification_type": string,"payload": NonNullable<Json>,"physician_profile_id": string,"read_at": string | null,"title": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"dedupe_key": string,"deep_link": string,"delivery_channel": string,"destination_id"?: string | null,"destination_type": string,"email_batch_id"?: string | null,"emailed_at"?: string | null,"id"?: string,"notification_type": string,"payload"?: NonNullable<Json>,"physician_profile_id": string,"read_at"?: string | null,"title": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dedupe_key"?: string,"deep_link"?: string,"delivery_channel"?: string,"destination_id"?: string | null,"destination_type"?: string,"email_batch_id"?: string | null,"emailed_at"?: string | null,"id"?: string,"notification_type"?: string,"payload"?: NonNullable<Json>,"physician_profile_id"?: string,"read_at"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "physician_notifications_email_batch_id_fkey"
      columns: ["email_batch_id"]
isOneToOne: false
      referencedRelation: "physician_notification_email_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "physician_notifications_physician_profile_id_fkey"
      columns: ["physician_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"physician_region_ready_milestones": {
                  Row: {
                    "milestone": number,"notified_at": string,"physician_profile_id": string,"state": string
                  }
                  Insert: {
                    "milestone": number,"notified_at"?: string,"physician_profile_id": string,"state": string
                  }
                  Update: {
                    "milestone"?: number,"notified_at"?: string,"physician_profile_id"?: string,"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "physician_region_ready_milestones_physician_profile_id_fkey"
      columns: ["physician_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_claims": {
                  Row: {
                    "approved_organization_id": string | null,"attestation_text_version": string,"authority_attestation": boolean,"claim_type": string,"claimant_name": string,"claimant_phone": string | null,"claimant_title": string,"claimant_work_email": string,"claimant_work_email_verification_method": string | null,"claimant_work_email_verified_at": string | null,"created_at": string,"id": string,"practice_id": string,"rejection_reason": string | null,"review_notes": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"submitted_by": string,"updated_at": string
                  }
                  Insert: {
                    "approved_organization_id"?: string | null,"attestation_text_version": string,"authority_attestation": boolean,"claim_type": string,"claimant_name": string,"claimant_phone"?: string | null,"claimant_title": string,"claimant_work_email": string,"claimant_work_email_verification_method"?: string | null,"claimant_work_email_verified_at"?: string | null,"created_at"?: string,"id"?: string,"practice_id": string,"rejection_reason"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"submitted_by": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_organization_id"?: string | null,"attestation_text_version"?: string,"authority_attestation"?: boolean,"claim_type"?: string,"claimant_name"?: string,"claimant_phone"?: string | null,"claimant_title"?: string,"claimant_work_email"?: string,"claimant_work_email_verification_method"?: string | null,"claimant_work_email_verified_at"?: string | null,"created_at"?: string,"id"?: string,"practice_id"?: string,"rejection_reason"?: string | null,"review_notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"submitted_by"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_claims_approved_organization_id_fkey"
      columns: ["approved_organization_id"]
isOneToOne: false
      referencedRelation: "employer_organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_claims_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_error_reports": {
                  Row: {
                    "admin_notes": string | null,"created_at": string,"description": string,"field_flagged": string,"id": string,"practice_id": string,"reported_by": string,"resolved_at": string | null,"snapshot": Json | null,"status": string
                  }
                  Insert: {
                    "admin_notes"?: string | null,"created_at"?: string,"description": string,"field_flagged": string,"id"?: string,"practice_id": string,"reported_by": string,"resolved_at"?: string | null,"snapshot"?: Json | null,"status"?: string
                  }
                  Update: {
                    "admin_notes"?: string | null,"created_at"?: string,"description"?: string,"field_flagged"?: string,"id"?: string,"practice_id"?: string,"reported_by"?: string,"resolved_at"?: string | null,"snapshot"?: Json | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_error_reports_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_error_reports_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_locations": {
                  Row: {
                    "address": string | null,"city": string | null,"created_at": string | null,"doctor_count": number | null,"id": string,"practice_id": string,"rank_by_doctors": number | null,"state": string | null,"zip": string | null
                  }
                  Insert: {
                    "address"?: string | null,"city"?: string | null,"created_at"?: string | null,"doctor_count"?: number | null,"id"?: string,"practice_id": string,"rank_by_doctors"?: number | null,"state"?: string | null,"zip"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"city"?: string | null,"created_at"?: string | null,"doctor_count"?: number | null,"id"?: string,"practice_id"?: string,"rank_by_doctors"?: number | null,"state"?: string | null,"zip"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_locations_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"practices": {
                  Row: {
                    "city": string | null,"city_st": string | null,"created_at": string | null,"experience_level": number | null,"experience_level_delta": number | null,"id": string,"latest_roster_size": number | null,"med_yrs_grad": number | null,"org_pac_id": string | null,"organization_id": string | null,"phone": string | null,"practice_name": string | null,"retention_score": number | null,"retention_score_delta": number | null,"short_tenure_departure_count": number | null,"specialty_id": string | null,"state": string | null,"tenure_0_1": number | null,"tenure_2_3": number | null,"tenure_4_5": number | null,"tenure_6_7": number | null,"tenure_8_plus": number | null,"total_physicians_all_time": number | null,"updated_at": string | null,"veteran_count": number | null,"website": string | null
                  }
                  Insert: {
                    "city"?: string | null,"city_st"?: string | null,"created_at"?: string | null,"experience_level"?: number | null,"experience_level_delta"?: number | null,"id"?: string,"latest_roster_size"?: number | null,"med_yrs_grad"?: number | null,"org_pac_id"?: string | null,"organization_id"?: string | null,"phone"?: string | null,"practice_name"?: string | null,"retention_score"?: number | null,"retention_score_delta"?: number | null,"short_tenure_departure_count"?: number | null,"specialty_id"?: string | null,"state"?: string | null,"tenure_0_1"?: number | null,"tenure_2_3"?: number | null,"tenure_4_5"?: number | null,"tenure_6_7"?: number | null,"tenure_8_plus"?: number | null,"total_physicians_all_time"?: number | null,"updated_at"?: string | null,"veteran_count"?: number | null,"website"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"city_st"?: string | null,"created_at"?: string | null,"experience_level"?: number | null,"experience_level_delta"?: number | null,"id"?: string,"latest_roster_size"?: number | null,"med_yrs_grad"?: number | null,"org_pac_id"?: string | null,"organization_id"?: string | null,"phone"?: string | null,"practice_name"?: string | null,"retention_score"?: number | null,"retention_score_delta"?: number | null,"short_tenure_departure_count"?: number | null,"specialty_id"?: string | null,"state"?: string | null,"tenure_0_1"?: number | null,"tenure_2_3"?: number | null,"tenure_4_5"?: number | null,"tenure_6_7"?: number | null,"tenure_8_plus"?: number | null,"total_physicians_all_time"?: number | null,"updated_at"?: string | null,"veteran_count"?: number | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "practices_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practices_specialty_id_fkey"
      columns: ["specialty_id"]
isOneToOne: false
      referencedRelation: "specialties"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "clinical_focus": (string)[] | null,"created_at": string | null,"current_practice": string | null,"data_sharing": boolean | null,"deleted_at": string | null,"email": string,"first_name": string | null,"id": string,"industry_partnership_acknowledged": boolean,"is_admin": boolean | null,"is_internal": boolean,"last_name": string | null,"notify_career_emails": boolean,"notify_connect_emails": boolean,"notify_followed_practice_emails": boolean,"notify_regional_emails": boolean,"npi": string | null,"npi_verified": boolean | null,"onboarding_complete": boolean | null,"phone": string | null,"practice_setting_preference": string | null,"preferred_state": (string)[] | null,"procedures_desired": string | null,"procedures_performed": string | null,"signup_date": string | null,"start_year": number | null,"subspecialty": string | null,"terms_accepted": boolean | null,"training_status": string | null,"updated_at": string | null,"user_id": string | null,"_connect_anonymous_physician_json": Json | null,"_connect_unlocked_physician_json": Json | null
                  }
                  Insert: {
                    "clinical_focus"?: (string)[] | null,"created_at"?: string | null,"current_practice"?: string | null,"data_sharing"?: boolean | null,"deleted_at"?: string | null,"email": string,"first_name"?: string | null,"id"?: string,"industry_partnership_acknowledged"?: boolean,"is_admin"?: boolean | null,"is_internal"?: boolean,"last_name"?: string | null,"notify_career_emails"?: boolean,"notify_connect_emails"?: boolean,"notify_followed_practice_emails"?: boolean,"notify_regional_emails"?: boolean,"npi"?: string | null,"npi_verified"?: boolean | null,"onboarding_complete"?: boolean | null,"phone"?: string | null,"practice_setting_preference"?: string | null,"preferred_state"?: (string)[] | null,"procedures_desired"?: string | null,"procedures_performed"?: string | null,"signup_date"?: string | null,"start_year"?: number | null,"subspecialty"?: string | null,"terms_accepted"?: boolean | null,"training_status"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "clinical_focus"?: (string)[] | null,"created_at"?: string | null,"current_practice"?: string | null,"data_sharing"?: boolean | null,"deleted_at"?: string | null,"email"?: string,"first_name"?: string | null,"id"?: string,"industry_partnership_acknowledged"?: boolean,"is_admin"?: boolean | null,"is_internal"?: boolean,"last_name"?: string | null,"notify_career_emails"?: boolean,"notify_connect_emails"?: boolean,"notify_followed_practice_emails"?: boolean,"notify_regional_emails"?: boolean,"npi"?: string | null,"npi_verified"?: boolean | null,"onboarding_complete"?: boolean | null,"phone"?: string | null,"practice_setting_preference"?: string | null,"preferred_state"?: (string)[] | null,"procedures_desired"?: string | null,"procedures_performed"?: string | null,"signup_date"?: string | null,"start_year"?: number | null,"subspecialty"?: string | null,"terms_accepted"?: boolean | null,"training_status"?: string | null,"updated_at"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [

                  ]
                },"shortlists": {
                  Row: {
                    "created_at": string | null,"id": string,"physician_id": string,"practice_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"physician_id": string,"practice_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"physician_id"?: string,"practice_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shortlists_physician_id_fkey"
      columns: ["physician_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shortlists_practice_id_fkey"
      columns: ["practice_id"]
isOneToOne: false
      referencedRelation: "practices"
      referencedColumns: ["id"]
    }
                  ]
                },"specialties": {
                  Row: {
                    "id": string,"name": string | null
                  }
                  Insert: {
                    "id"?: string,"name"?: string | null
                  }
                  Update: {
                    "id"?: string,"name"?: string | null
                  }
                  Relationships: [

                  ]
                },"sponsor_brief_issues": {
                  Row: {
                    "audience": string,"created_at": string,"id": string,"issue_slug": string,"vendor_id": string
                  }
                  Insert: {
                    "audience": string,"created_at"?: string,"id"?: string,"issue_slug": string,"vendor_id": string
                  }
                  Update: {
                    "audience"?: string,"created_at"?: string,"id"?: string,"issue_slug"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_brief_issues_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "sponsor_vendor_profiles"
      referencedColumns: ["vendor_id"]
    }
                  ]
                },"sponsor_brief_items": {
                  Row: {
                    "cta_label": string | null,"cta_url": string | null,"event_label": string | null,"id": string,"illustrative": boolean,"included_publicly": boolean,"position": number,"revision_id": string,"source_label": string,"source_type": string | null,"source_url": string | null,"summary": string,"title": string,"verification_state": string
                  }
                  Insert: {
                    "cta_label"?: string | null,"cta_url"?: string | null,"event_label"?: string | null,"id"?: string,"illustrative"?: boolean,"included_publicly"?: boolean,"position": number,"revision_id": string,"source_label": string,"source_type"?: string | null,"source_url"?: string | null,"summary": string,"title": string,"verification_state"?: string
                  }
                  Update: {
                    "cta_label"?: string | null,"cta_url"?: string | null,"event_label"?: string | null,"id"?: string,"illustrative"?: boolean,"included_publicly"?: boolean,"position"?: number,"revision_id"?: string,"source_label"?: string,"source_type"?: string | null,"source_url"?: string | null,"summary"?: string,"title"?: string,"verification_state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_brief_items_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "sponsor_brief_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"sponsor_brief_revisions": {
                  Row: {
                    "archived_at": string | null,"audience": string,"company_approval_recorded_by": string | null,"company_approval_reference": string | null,"company_approved_at": string | null,"company_approver_name": string | null,"company_approver_organization": string | null,"company_approver_title": string | null,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"introduction": string,"issue_id": string,"matchmed_approved_at": string | null,"matchmed_approved_by": string | null,"pdf_asset_path": string | null,"pdf_asset_state": string,"public_sharing_enabled": boolean,"publication_state": string,"published_at": string | null,"recalled_at": string | null,"revision_number": number,"title": string,"vendor_id": string,"withdrawal_reason": string | null,"withdrawn_at": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"audience": string,"company_approval_recorded_by"?: string | null,"company_approval_reference"?: string | null,"company_approved_at"?: string | null,"company_approver_name"?: string | null,"company_approver_organization"?: string | null,"company_approver_title"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"introduction": string,"issue_id": string,"matchmed_approved_at"?: string | null,"matchmed_approved_by"?: string | null,"pdf_asset_path"?: string | null,"pdf_asset_state"?: string,"public_sharing_enabled"?: boolean,"publication_state"?: string,"published_at"?: string | null,"recalled_at"?: string | null,"revision_number": number,"title": string,"vendor_id": string,"withdrawal_reason"?: string | null,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"audience"?: string,"company_approval_recorded_by"?: string | null,"company_approval_reference"?: string | null,"company_approved_at"?: string | null,"company_approver_name"?: string | null,"company_approver_organization"?: string | null,"company_approver_title"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"introduction"?: string,"issue_id"?: string,"matchmed_approved_at"?: string | null,"matchmed_approved_by"?: string | null,"pdf_asset_path"?: string | null,"pdf_asset_state"?: string,"public_sharing_enabled"?: boolean,"publication_state"?: string,"published_at"?: string | null,"recalled_at"?: string | null,"revision_number"?: number,"title"?: string,"vendor_id"?: string,"withdrawal_reason"?: string | null,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_brief_revisions_issue_id_fkey"
      columns: ["issue_id"]
isOneToOne: false
      referencedRelation: "sponsor_brief_issues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sponsor_brief_revisions_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"sponsor_public_slug_redirects": {
                  Row: {
                    "created_at": string,"from_slug": string,"vendor_id": string
                  }
                  Insert: {
                    "created_at"?: string,"from_slug": string,"vendor_id": string
                  }
                  Update: {
                    "created_at"?: string,"from_slug"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_public_slug_redirects_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"sponsor_publication_events": {
                  Row: {
                    "action": string,"actor_id": string,"brief_issue_id": string | null,"brief_revision_id": string | null,"content_id": string | null,"created_at": string,"external_reference": string | null,"id": string,"new_state": Json | null,"previous_state": Json | null,"reason": string | null,"vendor_id": string
                  }
                  Insert: {
                    "action": string,"actor_id": string,"brief_issue_id"?: string | null,"brief_revision_id"?: string | null,"content_id"?: string | null,"created_at"?: string,"external_reference"?: string | null,"id"?: string,"new_state"?: Json | null,"previous_state"?: Json | null,"reason"?: string | null,"vendor_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"brief_issue_id"?: string | null,"brief_revision_id"?: string | null,"content_id"?: string | null,"created_at"?: string,"external_reference"?: string | null,"id"?: string,"new_state"?: Json | null,"previous_state"?: Json | null,"reason"?: string | null,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_publication_events_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"sponsor_vendor_content": {
                  Row: {
                    "archived_at": string | null,"audience": string,"company_approval_recorded_by": string | null,"company_approval_reference": string | null,"company_approved_at": string | null,"company_approver_name": string | null,"company_approver_organization": string | null,"company_approver_title": string | null,"created_at": string,"cta_label": string | null,"description": string | null,"event_date": string | null,"expires_at": string | null,"id": string,"illustrative": boolean,"image_alt": string | null,"image_url": string | null,"is_active": boolean,"matchmed_approved_at": string | null,"matchmed_approved_by": string | null,"publication_state": string,"published_at": string | null,"recalled_at": string | null,"regulatory_note": string | null,"replaces_content_id": string | null,"revision_number": number,"section_type": string,"sort_order": number,"source_label": string | null,"source_type": string | null,"status_label": string | null,"title": string,"updated_at": string,"updated_by": string | null,"url": string | null,"vendor_id": string,"verification_state": string,"withdrawal_reason": string | null,"withdrawn_at": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"audience"?: string,"company_approval_recorded_by"?: string | null,"company_approval_reference"?: string | null,"company_approved_at"?: string | null,"company_approver_name"?: string | null,"company_approver_organization"?: string | null,"company_approver_title"?: string | null,"created_at"?: string,"cta_label"?: string | null,"description"?: string | null,"event_date"?: string | null,"expires_at"?: string | null,"id"?: string,"illustrative"?: boolean,"image_alt"?: string | null,"image_url"?: string | null,"is_active"?: boolean,"matchmed_approved_at"?: string | null,"matchmed_approved_by"?: string | null,"publication_state"?: string,"published_at"?: string | null,"recalled_at"?: string | null,"regulatory_note"?: string | null,"replaces_content_id"?: string | null,"revision_number"?: number,"section_type": string,"sort_order"?: number,"source_label"?: string | null,"source_type"?: string | null,"status_label"?: string | null,"title": string,"updated_at"?: string,"updated_by"?: string | null,"url"?: string | null,"vendor_id": string,"verification_state"?: string,"withdrawal_reason"?: string | null,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"audience"?: string,"company_approval_recorded_by"?: string | null,"company_approval_reference"?: string | null,"company_approved_at"?: string | null,"company_approver_name"?: string | null,"company_approver_organization"?: string | null,"company_approver_title"?: string | null,"created_at"?: string,"cta_label"?: string | null,"description"?: string | null,"event_date"?: string | null,"expires_at"?: string | null,"id"?: string,"illustrative"?: boolean,"image_alt"?: string | null,"image_url"?: string | null,"is_active"?: boolean,"matchmed_approved_at"?: string | null,"matchmed_approved_by"?: string | null,"publication_state"?: string,"published_at"?: string | null,"recalled_at"?: string | null,"regulatory_note"?: string | null,"replaces_content_id"?: string | null,"revision_number"?: number,"section_type"?: string,"sort_order"?: number,"source_label"?: string | null,"source_type"?: string | null,"status_label"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"url"?: string | null,"vendor_id"?: string,"verification_state"?: string,"withdrawal_reason"?: string | null,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_vendor_content_replaces_fk"
      columns: ["replaces_content_id"]
isOneToOne: false
      referencedRelation: "sponsor_vendor_content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sponsor_vendor_content_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "sponsor_vendor_profiles"
      referencedColumns: ["vendor_id"]
    }
                  ]
                },"sponsor_vendor_profiles": {
                  Row: {
                    "atlas_enabled": boolean,"created_at": string,"directory_visible": boolean,"disclosure_text": string | null,"employers_enabled": boolean,"is_active": boolean,"logo_url": string | null,"public_slug": string,"short_description": string | null,"sort_order": number,"updated_at": string,"updated_by": string | null,"vendor_id": string
                  }
                  Insert: {
                    "atlas_enabled"?: boolean,"created_at"?: string,"directory_visible"?: boolean,"disclosure_text"?: string | null,"employers_enabled"?: boolean,"is_active"?: boolean,"logo_url"?: string | null,"public_slug": string,"short_description"?: string | null,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"vendor_id": string
                  }
                  Update: {
                    "atlas_enabled"?: boolean,"created_at"?: string,"directory_visible"?: boolean,"disclosure_text"?: string | null,"employers_enabled"?: boolean,"is_active"?: boolean,"logo_url"?: string | null,"public_slug"?: string,"short_description"?: string | null,"sort_order"?: number,"updated_at"?: string,"updated_by"?: string | null,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsor_vendor_profiles_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: true
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_categories": {
                  Row: {
                    "category_id": string,"created_at": string,"sort_order": number,"vendor_id": string
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"sort_order"?: number,"vendor_id": string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"sort_order"?: number,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_categories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "infrastructure_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_categories_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_products": {
                  Row: {
                    "active": boolean,"category_id": string | null,"created_at": string,"display_label": string,"id": string,"updated_at": string,"vendor_id": string
                  }
                  Insert: {
                    "active"?: boolean,"category_id"?: string | null,"created_at"?: string,"display_label": string,"id"?: string,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "active"?: boolean,"category_id"?: string | null,"created_at"?: string,"display_label"?: string,"id"?: string,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "infrastructure_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_products_vendor_id_fkey"
      columns: ["vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["id"]
    }
                  ]
                },"vendors": {
                  Row: {
                    "active": boolean,"created_at": string,"display_label": string,"id": string,"legal_name": string | null,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"display_label": string,"id"?: string,"legal_name"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"display_label"?: string,"id"?: string,"legal_name"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_admin_clear_employer_profile_public_fields":
{ Args: { "p_practice_id": string }; Returns: number
                           },
"_admin_deactivate_practice_operates_links":
{ Args: { "p_practice_id": string,"p_reason": string }; Returns: number
                           },
"_admin_delete_employer_layer3_children":
{ Args: { "p_practice_id": string }; Returns: Json
                           },
"_audience_matches":
{ Args: { "p_row": string,"p_surface": string }; Returns: boolean
                           },
"_brief_public_payload":
{ Args: { "p_label": string,"p_revision_id": string }; Returns: Json
                           },
"_connect_active_organization_id":
{ Args: { "p_practice_id": string }; Returns: string
                           },
"_connect_anonymous_physician_json":
{ Args: { "p_profile": Database["public"]['Tables']["profiles"]['Row'] }; Returns: Json
                           },
"_connect_anonymous_request_notice":
{ Args: { "p_clinical_focus": (string)[],"p_practice": string }; Returns: string
                           },
"_connect_assert_actor_side":
{ Args: { "p_actor_side": string,"p_relationship": Database["public"]['Tables']["connect_relationships"]['Row'] }; Returns: string
                           },
"_connect_caller_physician_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "clinical_focus": (string)[] | null,
"created_at": string | null,
"current_practice": string | null,
"data_sharing": boolean | null,
"deleted_at": string | null,
"email": string,
"first_name": string | null,
"id": string,
"industry_partnership_acknowledged": boolean,
"is_admin": boolean | null,
"is_internal": boolean,
"last_name": string | null,
"notify_career_emails": boolean,
"notify_connect_emails": boolean,
"notify_followed_practice_emails": boolean,
"notify_regional_emails": boolean,
"npi": string | null,
"npi_verified": boolean | null,
"onboarding_complete": boolean | null,
"phone": string | null,
"practice_setting_preference": string | null,
"preferred_state": (string)[] | null,
"procedures_desired": string | null,
"procedures_performed": string | null,
"signup_date": string | null,
"start_year": number | null,
"subspecialty": string | null,
"terms_accepted": boolean | null,
"training_status": string | null,
"updated_at": string | null,
"user_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"_connect_enqueue_employer_emails":
{ Args: { "p_body": string,"p_dedupe_prefix": string,"p_deep_link": string,"p_email_kind": string,"p_payload": Json,"p_practice_id": string,"p_relationship_id": string,"p_title": string }; Returns: number
                           },
"_connect_enqueue_message_notifications":
{ Args: { "p_message_id": string,"p_relationship": Database["public"]['Tables']["connect_relationships"]['Row'],"p_sender_side": string }; Returns: undefined
                           },
"_connect_has_unread":
{ Args: { "p_relationship_id": string,"p_viewer_side": string }; Returns: boolean
                           },
"_connect_insert_message":
{ Args: { "p_body": string,"p_is_intro"?: boolean,"p_relationship_id": string,"p_sender_side": string,"p_sender_user_id": string }; Returns: string
                           },
"_connect_message_covers":
{ Args: { "p_candidate_created": string,"p_candidate_id": string,"p_last_id": string }; Returns: boolean
                           },
"_connect_normalize_message_body":
{ Args: { "p_body": string }; Returns: string
                           },
"_connect_physician_initials":
{ Args: { "p_first": string,"p_last": string }; Returns: string
                           },
"_connect_practice_editor_recipients":
{ Args: { "p_practice_id": string }; Returns: {
              "email": string,"user_id": string
            }[]
                           },
"_connect_record_event":
{ Args: { "p_actor_side": string,"p_actor_user_id": string,"p_event_type": string,"p_metadata"?: Json,"p_relationship_id": string }; Returns: undefined
                           },
"_connect_terminate_for_physician":
{ Args: { "p_actor_side": string,"p_actor_user_id": string,"p_physician_profile_id": string,"p_reason"?: string }; Returns: number
                           },
"_connect_terminate_for_practice":
{ Args: { "p_actor_side": string,"p_actor_user_id": string,"p_practice_id": string,"p_reason"?: string }; Returns: number
                           },
"_connect_unlocked_physician_json":
{ Args: { "p_profile": Database["public"]['Tables']["profiles"]['Row'] }; Returns: Json
                           },
"_connect_validate_opportunity":
{ Args: { "p_opportunity_id": string,"p_practice_id": string }; Returns: undefined
                           },
"_connect_viewer_side":
{ Args: { "p_relationship": Database["public"]['Tables']["connect_relationships"]['Row'] }; Returns: string
                           },
"_employer_active_operates_link_exists":
{ Args: { "p_practice_id": string }; Returns: boolean
                           },
"_employer_membership_can_edit_practice":
{ Args: { "p_practice_id": string,"p_user_id": string }; Returns: boolean
                           },
"_employer_slugify":
{ Args: { "p_name": string }; Returns: string
                           },
"_library_item_readable":
{ Args: { "p_company": string,"p_expires_at": string,"p_illustrative": boolean,"p_matchmed": string,"p_published_at": string,"p_recalled": string,"p_row_active": boolean,"p_state": string,"p_verified": string,"p_withdrawn": string }; Returns: boolean
                           },
"_notification_enqueue_opportunity_event":
{ Args: { "p_clinical_focus": string,"p_event": string,"p_opportunity_id": string,"p_practice_id": string,"p_version"?: number }; Returns: undefined
                           },
"_notification_insert":
{ Args: { "p_body": string,"p_channel": string,"p_dedupe_key": string,"p_deep_link": string,"p_destination_id": string,"p_destination_type": string,"p_payload": Json,"p_physician_profile_id": string,"p_title": string,"p_type": string }; Returns: string
                           },
"_notification_is_eligible_physician":
{ Args: { "p_profile_id": string }; Returns: boolean
                           },
"_notification_matching_physicians":
{ Args: { "p_clinical_focus": string,"p_practice_id": string }; Returns: {
              "physician_profile_id": string
            }[]
                           },
"_notification_material_changed":
{ Args: { "p_new_horizon": string,"p_new_max": number,"p_new_min": number,"p_new_open": boolean,"p_old_horizon": string,"p_old_max": number,"p_old_min": number,"p_old_open": boolean }; Returns: boolean
                           },
"_notification_opportunity_is_visible":
{ Args: { "p_practice_id": string }; Returns: boolean
                           },
"_notification_practice_label":
{ Args: { "p_practice_id": string }; Returns: string
                           },
"_notification_related_physicians":
{ Args: { "p_practice_id": string }; Returns: {
              "physician_profile_id": string,"relationship": string
            }[]
                           },
"_organization_descendant_ids":
{ Args: { "p_root_org_id": string }; Returns: string[]
                           },
"_physician_opportunity_horizon_rank":
{ Args: { "p_horizon": string }; Returns: number
                           },
"_physician_opportunity_matches_state":
{ Args: { "p_practice_id": string,"p_state": string }; Returns: boolean
                           },
"_physician_opportunity_practice_states":
{ Args: { "p_practice_id": string }; Returns: (string)[]
                           },
"_public_ilike_pattern":
{ Args: { "nq": string }; Returns: string
                           },
"_public_is_current_roster_status":
{ Args: { "p_status": string }; Returns: boolean
                           },
"_public_normalize_search_query":
{ Args: { "q": string }; Returns: string
                           },
"_require_employer_member":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_require_sponsor_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_sponsor_audit":
{ Args: { "p_action": string,"p_content_id": string,"p_issue_id": string,"p_new": Json,"p_previous": Json,"p_reason": string,"p_reference": string,"p_revision_id": string,"p_vendor_id": string }; Returns: undefined
                           },
"admin_create_brief_draft":
{ Args: { "p_audience": string,"p_introduction": string,"p_issue_slug": string,"p_title": string,"p_vendor_id": string }; Returns: string
                           },
"admin_create_content_replacement":
{ Args: { "p_content_id": string }; Returns: string
                           },
"admin_full_reset_employer_practice":
{ Args: { "p_practice_id": string,"p_reason"?: string }; Returns: Json
                           },
"admin_get_brief_publication_candidate":
{ Args: { "p_revision_id": string }; Returns: Json
                           },
"admin_get_sponsor_preview":
{ Args: { "p_slug": string }; Returns: Json
                           },
"admin_publish_brief":
{ Args: { "p_revision_id": string,"p_sharing": boolean }; Returns: undefined
                           },
"admin_publish_content":
{ Args: { "p_content_id": string }; Returns: undefined
                           },
"admin_record_company_approval_brief":
{ Args: { "p_approver_name": string,"p_approver_org": string,"p_approver_title": string,"p_reference": string,"p_revision_id": string }; Returns: undefined
                           },
"admin_record_company_approval_content":
{ Args: { "p_approver_name": string,"p_approver_org": string,"p_approver_title": string,"p_content_id": string,"p_reference": string }; Returns: undefined
                           },
"admin_record_matchmed_approval_brief":
{ Args: { "p_revision_id": string }; Returns: undefined
                           },
"admin_record_matchmed_approval_content":
{ Args: { "p_content_id": string }; Returns: undefined
                           },
"admin_remove_claim_verification":
{ Args: { "p_practice_id": string,"p_reason"?: string }; Returns: Json
                           },
"admin_rename_public_slug":
{ Args: { "p_new_slug": string,"p_vendor_id": string }; Returns: undefined
                           },
"admin_replace_brief_items":
{ Args: { "p_items": Json,"p_revision_id": string }; Returns: undefined
                           },
"admin_reset_employer_layer":
{ Args: { "p_practice_id": string,"p_reason"?: string }; Returns: Json
                           },
"admin_set_brief_state":
{ Args: { "p_reason": string,"p_revision_id": string,"p_state": string }; Returns: undefined
                           },
"admin_set_sponsor_flags":
{ Args: { "p_atlas_enabled": boolean,"p_directory_visible": boolean,"p_employers_enabled": boolean,"p_is_active": boolean,"p_reason": string,"p_vendor_id": string }; Returns: undefined
                           },
"admin_withdraw_content":
{ Args: { "p_content_id": string,"p_reason": string }; Returns: undefined
                           },
"approve_employer_display_name":
{ Args: { "p_practice_id": string }; Returns: undefined
                           },
"approve_practice_access_request":
{ Args: { "p_claim_id": string,"p_role"?: string }; Returns: string
                           },
"approve_practice_initial_claim":
{ Args: { "p_claim_id": string }; Returns: string
                           },
"can_access_organization":
{ Args: { "p_org_id": string,"p_user_id": string }; Returns: boolean
                           },
"can_admin_organization":
{ Args: { "p_org_id": string,"p_user_id": string }; Returns: boolean
                           },
"can_edit_practice":
{ Args: { "p_practice_id": string,"p_user_id": string }; Returns: boolean
                           },
"complete_employer_initial_review":
{ Args: { "p_practice_id": string }; Returns: undefined
                           },
"complete_employer_physician_ready":
{ Args: { "p_practice_id": string }; Returns: undefined
                           },
"connect_accept":
{ Args: { "p_relationship_id": string }; Returns: Json
                           },
"connect_active_for_pair":
{ Args: { "p_physician_profile_id"?: string,"p_practice_id": string }; Returns: Json
                           },
"connect_cancel":
{ Args: { "p_relationship_id": string }; Returns: Json
                           },
"connect_claim_employer_emails":
{ Args: { "p_limit"?: number }; Returns: {
              "body": string,"deep_link": string,"email": string,"email_kind": string,"outbox_id": string,"payload": Json,"practice_id": string,"recipient_user_id": string,"relationship_id": string,"status": string,"title": string
            }[]
                           },
"connect_decline":
{ Args: { "p_relationship_id": string }; Returns: Json
                           },
"connect_disconnect":
{ Args: { "p_relationship_id": string }; Returns: Json
                           } |
{ Args: { "p_actor_side": string,"p_relationship_id": string }; Returns: Json
                           },
"connect_finalize_employer_email":
{ Args: { "p_error_detail"?: string,"p_outbox_id": string,"p_provider_message_id"?: string,"p_status": string }; Returns: undefined
                           },
"connect_get_physician_profile":
{ Args: { "p_relationship_id": string }; Returns: Json
                           },
"connect_initiate_by_physician":
{ Args: { "p_intro_note"?: string,"p_opportunity_id"?: string,"p_practice_id": string }; Returns: Json
                           },
"connect_initiate_by_practice":
{ Args: { "p_intro_note"?: string,"p_opportunity_id"?: string,"p_physician_profile_id": string,"p_practice_id": string }; Returns: Json
                           },
"connect_list_anonymous_physicians":
{ Args: { "p_clinical_focus"?: string,"p_limit"?: number,"p_offset"?: number,"p_practice_id": string,"p_preferred_state"?: string,"p_start_year"?: string,"p_training_status"?: string }; Returns: Json
                           },
"connect_list_for_physician":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"connect_list_for_practice":
{ Args: { "p_practice_id": string }; Returns: Json
                           },
"connect_list_messages":
{ Args: { "p_actor_side": string,"p_before"?: string,"p_limit"?: number,"p_relationship_id": string }; Returns: Json
                           } |
{ Args: { "p_before"?: string,"p_limit"?: number,"p_relationship_id": string }; Returns: Json
                           },
"connect_mark_thread_read":
{ Args: { "p_relationship_id": string }; Returns: Json
                           } |
{ Args: { "p_actor_side": string,"p_relationship_id": string }; Returns: Json
                           },
"connect_practice_is_eligible":
{ Args: { "p_practice_id": string }; Returns: boolean
                           },
"connect_send_message":
{ Args: { "p_body": string,"p_relationship_id": string }; Returns: Json
                           } |
{ Args: { "p_actor_side": string,"p_body": string,"p_relationship_id": string }; Returns: Json
                           },
"connect_thread_seen_state":
{ Args: { "p_relationship_id": string }; Returns: Json
                           } |
{ Args: { "p_actor_side": string,"p_relationship_id": string }; Returns: Json
                           },
"count_physician_jobs":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"count_physician_opportunities":
{ Args: { "p_clinical_focus"?: string,"p_hiring_horizon"?: string,"p_state"?: string }; Returns: number
                           },
"deactivate_organization_practice_link":
{ Args: { "p_link_id": string,"p_reason"?: string }; Returns: undefined
                           },
"employer_assert_current_physician":
{ Args: { "p_doctor_id": string,"p_practice_id": string }; Returns: Json
                           },
"employer_create_practice_preview_token":
{ Args: { "p_practice_id": string }; Returns: string
                           },
"employer_fetch_practice_preview":
{ Args: { "p_practice_id": string,"p_token": string }; Returns: Json
                           },
"employer_get_practice_physician_history":
{ Args: { "p_practice_id": string }; Returns: Json
                           },
"employer_has_dashboard_access":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"employer_notifications_list_mine":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: {
              "body": string,"created_at": string,"deep_link": string,"id": string,"notification_type": string,"payload": Json,"practice_id": string,"read_at": string,"relationship_id": string,"title": string
            }[]
                           },
"employer_notifications_mark_all_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"employer_notifications_mark_read":
{ Args: { "p_notification_id": string }; Returns: boolean
                           },
"employer_notifications_unread_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"employer_overlay_publicly_visible":
{ Args: { "p_practice_id": string }; Returns: boolean
                           },
"employer_reconcile_roster_assertions":
{ Args: { "p_practice_id": string }; Returns: number
                           },
"employer_retract_roster_assertion":
{ Args: { "p_doctor_id": string,"p_practice_id": string }; Returns: Json
                           },
"employer_search_physicians_for_roster":
{ Args: { "p_limit"?: number,"p_practice_id": string,"p_query": string }; Returns: Json
                           },
"employer_unclaim_practice":
{ Args: { "p_practice_id": string,"p_reason"?: string }; Returns: undefined
                           },
"get_atlas_sponsor_page":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_employer_practice_sponsor_context":
{ Args: { "p_practice_id": string,"p_slug": string }; Returns: Json
                           },
"get_employer_sponsor_page":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_public_sponsor_brief":
{ Args: { "p_issue": string,"p_slug": string }; Returns: Json
                           },
"is_atlas_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_atlas_analysis_authorized":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"list_active_atlas_sponsors":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_active_sponsor_slugs":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"list_employer_sponsors":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_physician_jobs":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: Json
                           },
"list_physician_jobs_for_practice":
{ Args: { "p_practice_id": string }; Returns: Json
                           },
"list_physician_opportunities":
{ Args: { "p_clinical_focus"?: string,"p_hiring_horizon"?: string,"p_limit"?: number,"p_offset"?: number,"p_state"?: string }; Returns: Json
                           },
"list_physician_opportunities_for_practice":
{ Args: { "p_practice_id": string }; Returns: Json
                           },
"list_physician_ready_practice_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"list_sponsor_link_targets":
{ Args: { "p_audience": string }; Returns: Json
                           },
"notifications_claim_daily_digest":
{ Args: { "p_limit_physicians"?: number }; Returns: {
              "batch_id": string,"email": string,"items": Json,"physician_profile_id": string,"status": string
            }[]
                           },
"notifications_claim_transactional_emails":
{ Args: { "p_limit"?: number }; Returns: {
              "batch_id": string,"body": string,"deep_link": string,"email": string,"notification_id": string,"notification_type": string,"payload": Json,"physician_profile_id": string,"status": string,"title": string
            }[]
                           },
"notifications_finalize_email_batch":
{ Args: { "p_batch_id": string,"p_error_detail"?: string,"p_provider_message_id"?: string,"p_status": string }; Returns: undefined
                           },
"notifications_list_mine":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: {
              "body": string,"created_at": string,"deep_link": string,"delivery_channel": string,"destination_id": string,"destination_type": string,"id": string,"notification_type": string,"payload": Json,"read_at": string,"title": string
            }[]
                           },
"notifications_mark_all_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"notifications_mark_read":
{ Args: { "p_notification_id": string }; Returns: boolean
                           },
"notifications_process_region_milestones":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"notifications_unread_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"propose_employer_display_name":
{ Args: { "p_name": string,"p_practice_id": string }; Returns: undefined
                           },
"public_get_employer_practice_overlay":
{ Args: { "p_practice_id": string }; Returns: Json
                           },
"public_get_physician":
{ Args: { "p_id": string }; Returns: Json
                           },
"public_get_practice":
{ Args: { "p_id": string }; Returns: Json
                           },
"public_get_practice_locations":
{ Args: { "p_id": string }; Returns: Json
                           },
"public_get_practice_roster":
{ Args: { "p_id": string }; Returns: Json
                           },
"public_platform_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"public_search":
{ Args: { "q": string }; Returns: Json
                           },
"reject_employer_display_name":
{ Args: { "p_practice_id": string,"p_reason"?: string }; Returns: undefined
                           },
"reject_practice_claim":
{ Args: { "p_claim_id": string,"p_reason"?: string }; Returns: undefined
                           },
"resolve_sponsor_brief_canonical":
{ Args: { "p_issue": string,"p_slug": string }; Returns: Json
                           },
"revoke_organization_membership":
{ Args: { "p_membership_id": string,"p_notes"?: string }; Returns: undefined
                           },
"revoke_practice_claim":
{ Args: { "p_claim_id": string,"p_notes"?: string }; Returns: undefined
                           },
"self_leave_organization":
{ Args: { "p_organization_id": string }; Returns: undefined
                           },
"sponsor_https_url_problem":
{ Args: { "p_url": string }; Returns: string
                           },
"verify_claimant_work_email_manual":
{ Args: { "p_claim_id": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const
