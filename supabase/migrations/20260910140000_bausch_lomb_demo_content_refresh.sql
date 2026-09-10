-- MAT-16 content refresh: polished Bausch + Lomb demonstration page copy.
-- Additive data-only update. Does not alter schema, RPCs, auth, or taxonomy.
-- Replaces prior placeholder [Demo] seed rows for vendor slug bausch_plus_lomb.

UPDATE public.sponsor_vendor_profiles AS p
SET
  short_description = 'Ophthalmic technology, education, clinical resources, and professional support.',
  disclosure_text =
    'Demonstration page' || E'\n'
    || 'This page illustrates how a Bausch + Lomb partnership could appear within Atlas. '
    || 'Content is sourced from publicly available Bausch + Lomb materials and has not been '
    || 'reviewed or approved by Bausch + Lomb for use on Atlas.'
    || E'\n\n'
    || 'Bausch + Lomb is an Atlas industry partner. Partnership does not affect practice scores, '
    || 'rankings, Opportunities, physician visibility, or technology reporting.',
  updated_at = now()
FROM public.vendors AS v
WHERE p.vendor_id = v.id
  AND v.slug = 'bausch_plus_lomb';

DELETE FROM public.sponsor_vendor_content AS sc
USING public.vendors AS v
WHERE sc.vendor_id = v.id
  AND v.slug = 'bausch_plus_lomb';

INSERT INTO public.sponsor_vendor_content (
  vendor_id, section_type, title, description, url, event_date, status_label, cta_label, sort_order, is_active
)
SELECT v.id, x.section_type, x.title, x.description, x.url, x.event_date::date, x.status_label, x.cta_label, x.sort_order, true
FROM public.vendors AS v
CROSS JOIN (
  VALUES
    -- What’s New
    (
      'whats_new',
      'EyeGility™ Preloaded IOL Delivery System',
      'A preloaded IOL delivery system designed for the enVista® lens platform. Bausch + Lomb launched EyeGility in the U.S. with enVista Aspire™ in 2026.',
      'https://ir.bausch.com/press-releases/bausch-lomb-launches-eyegilitytm-inserter-preloaded-iol-delivery-system-united',
      NULL,
      'Now available in the U.S.',
      'Learn about EyeGility',
      10
    ),
    (
      'whats_new',
      'ELIOS™ Glaucoma System',
      'An implant-free excimer laser glaucoma procedure designed to create outflow channels. Bausch + Lomb reported positive 24-month results from its pivotal U.S. clinical trial in 2026. ELIOS has not yet been reviewed by the FDA for safety and efficacy in the United States.',
      'https://ir.bausch.com/press-releases/bausch-lomb-announces-positive-24-month-us-data-eliostm-system-treatment-glaucoma',
      NULL,
      'U.S. development',
      'Explore ELIOS',
      20
    ),
    (
      'whats_new',
      'seeLYRA™',
      'Bausch + Lomb describes seeLYRA as a next-generation femtosecond laser platform featuring live OCT guidance and soft docking.',
      'https://ir.bausch.com/press-releases/bausch-lomb-highlight-company-transformation-and-growth-strategy-investor-day',
      NULL,
      'Next-gen femtosecond platform',
      'Learn more',
      30
    ),
    (
      'whats_new',
      'Orphia™ Digital Health',
      'A brand-agnostic AI-powered digital health platform designed to reduce administrative burden for eye-care providers, initially focused on cataract education.',
      'https://ir.bausch.com/press-releases/bausch-lomb-introduces-orphiatm-ai-powered-digital-health-platform-built-return',
      NULL,
      'New digital health platform',
      'Explore Orphia',
      40
    ),

    -- Education
    (
      'education',
      'ESCRS 2026',
      'Bausch + Lomb is participating with scientific presentations, posters, educational programming, and technology demonstrations across cataract, refractive, glaucoma, and surgical care.',
      'https://ir.bausch.com/press-releases/bausch-lomb-announces-new-scientific-data-educational-events-european-society-1',
      '2026-09-11',
      'London · September 11–15, 2026',
      'View ESCRS activities',
      10
    ),
    (
      'education',
      'Redefining the Surgical Experience',
      'A Bausch + Lomb educational program focused on its integrated surgical portfolio, including technologies such as SeeLuma™, enVista Envy™, ELIOS™, and LuxSmart™.',
      'https://ir.bausch.com/press-releases/bausch-lomb-announces-new-scientific-data-educational-events-european-society-1',
      NULL,
      'Featured ESCRS program',
      'View program details',
      20
    ),
    (
      'education',
      'Congress & Educational Programs',
      'Explore upcoming congresses, scientific programs, educational events, and professional resources from Bausch + Lomb.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Explore programs',
      30
    ),

    -- Clinical Evidence
    (
      'clinical_evidence',
      'enVista Aspire™ Real-World Evidence',
      'A multicenter retrospective case series published in Ophthalmology and Therapy evaluated real-world outcomes with enVista Aspire™ and enVista Aspire™ Toric IOLs.',
      'https://ir.bausch.com/press-releases/bausch-lomb-announces-new-published-research-envista-aspiretm-real-world-experience',
      NULL,
      NULL,
      'View research',
      10
    ),
    (
      'clinical_evidence',
      'ELIOS™ 24-Month U.S. Trial Results',
      'Bausch + Lomb reported 24-month pivotal U.S. clinical trial results for ELIOS, including achievement of the study’s primary effectiveness endpoints. ELIOS remains under development in the United States.',
      'https://ir.bausch.com/press-releases/bausch-lomb-announces-positive-24-month-us-data-eliostm-system-treatment-glaucoma',
      NULL,
      NULL,
      'Review ELIOS data',
      20
    ),
    (
      'clinical_evidence',
      'ASCRS Scientific Library',
      'Explore Bausch + Lomb scientific presentations and congress materials spanning cataract, refractive, glaucoma, retina, and ocular surface care.',
      'https://ecp.bausch.com/congress-materials/ascrs-2026/',
      NULL,
      NULL,
      'Explore ASCRS research',
      30
    ),
    (
      'clinical_evidence',
      'Scientific & Medical Resources',
      'Access publications, congress materials, upcoming scientific events, and Bausch + Lomb professional resources.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Visit scientific hub',
      40
    ),

    -- Connect (outbound only; no Atlas identity)
    (
      'connect',
      'Talk to a Peer Surgeon',
      'Explore peer-to-peer educational opportunities with ophthalmologists experienced with Bausch + Lomb technologies.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Explore peer-to-peer education',
      10
    ),
    (
      'connect',
      'Find Your Local Representative',
      'Connect with your local Bausch + Lomb team for product, training, or practice support.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Find my representative',
      20
    ),
    (
      'connect',
      'Ask a Medical Question',
      'Connect with Bausch + Lomb Medical Affairs for scientific or clinical questions.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Submit a medical inquiry',
      30
    ),
    (
      'connect',
      'Request Product Information',
      'Explore Bausch + Lomb product and technology resources relevant to ophthalmic practice.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Contact Bausch + Lomb',
      40
    ),

    -- Training / Product Info
    (
      'training_product_info',
      'Cataract Surgery',
      'Explore the enVista® IOL platform, including enVista Aspire™, enVista Envy™, and EyeGility™ delivery technology.',
      'https://ecp.bausch.com/',
      NULL,
      NULL,
      'Explore cataract technology',
      10
    ),
    (
      'training_product_info',
      'Glaucoma',
      'Learn about Bausch + Lomb glaucoma technologies, including ELIOS™ under U.S. development.',
      'https://ir.bausch.com/press-releases/bausch-lomb-announces-positive-24-month-us-data-eliostm-system-treatment-glaucoma',
      NULL,
      NULL,
      'Explore glaucoma technology',
      20
    ),
    (
      'training_product_info',
      'Surgical Platforms',
      'Explore Bausch + Lomb surgical technologies including visualization, cataract, retina, and femtosecond laser platforms (including Stellaris Elite®, SeeLuma™, and seeLYRA™).',
      'https://ir.bausch.com/press-releases/bausch-lomb-highlight-company-transformation-and-growth-strategy-investor-day',
      NULL,
      NULL,
      'Explore surgical technology',
      30
    ),
    (
      'training_product_info',
      'Digital Practice Support',
      'Explore Orphia™, Bausch + Lomb’s brand-agnostic AI-powered digital health platform initially focused on cataract education.',
      'https://ir.bausch.com/press-releases/bausch-lomb-introduces-orphiatm-ai-powered-digital-health-platform-built-return',
      NULL,
      NULL,
      'Explore Orphia',
      40
    )
) AS x(section_type, title, description, url, event_date, status_label, cta_label, sort_order)
WHERE v.slug = 'bausch_plus_lomb';
