/**
 * Persist USGS product metadata and DYFI community-reported MMI observations.
 * PEIS, MMI, observed, reported, and modelled values remain explicitly distinct.
 */

export async function persistUsgsProducts(eventId, products, query) {
  if (typeof query !== 'function') throw new TypeError('A database query function is required.');

  const sourceResult = await query(
    `SELECT id, earthquake_event_id
     FROM event_sources
     WHERE provider = 'USGS' AND provider_event_id = $1`,
    [eventId]
  );
  const source = sourceResult.rows[0];
  if (!source?.id || !source.earthquake_event_id) {
    return { storedProducts: 0, storedObservations: 0 };
  }

  let storedProducts = 0;
  let storedObservations = 0;

  for (const productType of ['shakemap', 'dyfi']) {
    const product = products?.[productType];
    if (!product) continue;

    const code = String(product.code || eventId);
    const version = String(product.updateTime || '');
    const sourceUrl = product.contourUrl || product.geoJsonUrl || product.productUrl || null;
    const rawPayload = {
      type: product.type,
      code: product.code,
      source: product.source,
      status: product.status,
      updateTime: product.updateTime,
      preferredWeight: product.preferredWeight,
      productUrl: product.productUrl,
      contourUrl: product.contourUrl,
      geoJsonUrl: product.geoJsonUrl,
      files: product.files || {},
      rawProperties: product.rawProperties || {},
    };

    await query(
      `INSERT INTO intensity_products (
         event_source_id, provider, product_type, product_code, product_version,
         product_status, preferred_weight, intensity_scale, source_url,
         contents, raw_payload, retrieved_at
       ) VALUES ($1, 'USGS', $2, $3, $4, $5, $6, 'MMI', $7, $8::jsonb, $9::jsonb, NOW())
       ON CONFLICT (event_source_id, product_type, product_code, product_version)
       DO UPDATE SET product_status = EXCLUDED.product_status,
                     preferred_weight = EXCLUDED.preferred_weight,
                     source_url = EXCLUDED.source_url,
                     contents = EXCLUDED.contents,
                     raw_payload = EXCLUDED.raw_payload,
                     retrieved_at = NOW()`,
      [
        source.id,
        productType === 'shakemap' ? 'SHAKEMAP' : 'DYFI',
        code,
        version,
        product.status || null,
        product.preferredWeight == null ? null : Number(product.preferredWeight),
        sourceUrl,
        JSON.stringify(product.files || {}),
        JSON.stringify(rawPayload),
      ]
    );
    storedProducts++;
  }

  const dyfiFeatures = products?.dyfi?.geojson?.features;
  if (Array.isArray(dyfiFeatures)) {
    for (let index = 0; index < dyfiFeatures.length; index++) {
      const feature = dyfiFeatures[index];
      const properties = feature?.properties || {};
      const intensity = Number(properties.cdi ?? properties.intensity);
      const coordinates = feature?.geometry?.coordinates || [];
      const longitude = Number(coordinates[0]);
      const latitude = Number(coordinates[1]);
      if (
        !Number.isFinite(intensity) || intensity <= 0 || intensity > 12 ||
        !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180
      ) continue;

      const locality = String(properties.name || properties.place || properties.code || 'Unspecified locality');
      const sourceObservationId = String(
        feature.id || properties.code || `${locality}:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${index}`
      );
      const sampleCountValue = Number(properties.nresp ?? properties.responses);
      const sampleCount = Number.isFinite(sampleCountValue) && sampleCountValue >= 0
        ? Math.trunc(sampleCountValue)
        : null;
      const raw = {
        ...properties,
        source: 'USGS DYFI',
        sourceObservationId,
      };

      await query(
        `INSERT INTO intensity_observations (
           earthquake_event_id, provider, product_type, scale, intensity_value,
           locality, observation_type, uncertainty, source_url, raw_payload,
           source_observation_id, latitude, longitude, sample_count, retrieved_at
         ) VALUES (
           $1, 'USGS', 'DYFI', 'MMI', $2, $3, 'reported', $4::jsonb,
           $5, $6::jsonb, $7, $8, $9, $10, NOW()
         )
         ON CONFLICT DO NOTHING`,
        [
          source.earthquake_event_id,
          intensity,
          locality,
          JSON.stringify({ sampleCount, distanceKm: properties.dist ?? null }),
          products.dyfi.geoJsonUrl || products.dyfi.productUrl || null,
          JSON.stringify(raw),
          sourceObservationId,
          latitude,
          longitude,
          sampleCount,
        ]
      );
      storedObservations++;
    }
  }

  return { storedProducts, storedObservations };
}
