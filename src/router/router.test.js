import { describe, expect, it } from 'vitest'
import router from './index'

describe('router', () => {
  it('registers customer and admin routes', () => {
    const names = router.getRoutes().map((route) => route.name)

    expect(names).toEqual(expect.arrayContaining(['home', 'products', 'product-detail', 'cart', 'account', 'profile', 'admin', 'not-found']))
  })

  it('resolves product detail routes', () => {
    expect(router.resolve('/products/1').name).toBe('product-detail')
  })

  it('marks protected routes and resolves unknown locations to the 404 view', () => {
    expect(router.resolve('/profile').meta.requiresAuth).toBe(true)
    expect(router.resolve('/admin').meta.requiresAdmin).toBe(true)
    expect(router.resolve('/does-not-exist').name).toBe('not-found')
  })
})
