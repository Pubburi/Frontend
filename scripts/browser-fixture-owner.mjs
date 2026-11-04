export default async function verifyFixtureOwner(config) {
  const owner = process.env.PUBBURI_FIXTURE_OWNER
  for (const project of config.projects) {
    if (new URL(project.use.baseURL).origin !== new URL(process.env.PUBBURI_FIXTURE_URL).origin)
      throw new Error('Browser projects must use the runner-owned fixture origin.')
    const response = await fetch(project.use.baseURL, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    if (!response.ok || response.headers.get('x-pubburi-fixture-owner') !== owner)
      throw new Error('Browser tests require the preview owned by npm run test:browser.')
  }
}
