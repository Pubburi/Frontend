import { expect } from '@playwright/test'

export async function openCatalogFilters(page) {
  const disclosure = page.locator('details.catalog-search-advanced')
  await expect(disclosure).toBeVisible()
  if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click()
  await expect(disclosure).toHaveAttribute('open', '')
}
