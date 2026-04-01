import '@testing-library/jest-dom'

// Keep unit tests deterministic and avoid accidental real network calls.
if (!jest.isMockFunction(global.fetch)) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ providers: [] }),
    text: async () => '',
  })) as unknown as typeof fetch
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter() {
        return {
            push: jest.fn(),
            replace: jest.fn(),
            prefetch: jest.fn(),
        }
    },
    usePathname() {
        return ''
    },
}))

// IntersectionObserver isn't available in test environment
const mockIntersectionObserver = jest.fn()
mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
})
window.IntersectionObserver = mockIntersectionObserver
