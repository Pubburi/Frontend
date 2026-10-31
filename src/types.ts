export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
  totalPages: number
  hasNext: boolean
}
export interface Product {
  id: number
  name: string
  type: string
  price: number
  abv: number
  img?: string | null
  orderCount: number
}
export interface FavoriteState {
  productId: number
  favorited: boolean
}
export interface ProductFeatureValues {
  volumeMl: number | null
  description: string | null
  tasteTags: string[] | null
  aromaTags: string[] | null
  sourceName: string | null
  sourceUrl: string | null
  sourceNote: string | null
}
export interface ProductFeatures extends ProductFeatureValues {
  productId: number
}
export interface Market {
  id: number
  name: string
  latitude: number
  longitude: number
  image?: string
}
export interface User {
  id: string
  name: string
  role: 'USER' | 'ADMIN'
  stamps?: number
}
export type SurveyStatus = 'NOT_STARTED' | 'SKIPPED' | 'COMPLETED'
export interface ExplicitPreferences {
  surveyStatus: SurveyStatus
  softPreferences: {
    categories: string[] | null
    tasteTags: string[] | null
    aromaTags: string[] | null
    targetAbvPercent: number | null
  }
  hardConstraints: {
    minPriceKrw: number | null
    maxPriceKrw: number | null
    minAbvPercent: number | null
    maxAbvPercent: number | null
  }
}
export interface Review {
  id: number
  productId: number
  userId: string
  rating: number
  comment: string
}
export interface OrderDetail {
  id: number
  productId: number | null
  name: string
  type?: string
  quantity: number
  unitPrice: number | null
  sumPrice: number | null
  priceBasis?: string | null
}
export interface Order {
  oId: number
  userId: string | null
  orderType: string
  orderTable?: string | null
  orderTime: string
  completed: string
  details: OrderDetail[]
  totalPrice: number | null
  priceBasis?: string | null
}
export interface Profile {
  user: User
  grade: { title?: string; to?: number; step?: number; stepMax?: number }
}
