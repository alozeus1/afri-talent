import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "../header";
import { isAdminPath } from "../use-dropdown";
import type { User } from "@/lib/api";

// Mock the AuthContext since Header depends on useAuth
jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    isLoading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  })),
}));
jest.mock('@/components/layout/theme-toggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));
jest.mock('@/lib/network-profile', () => ({
  useNetworkProfile: () => ({
    online: true,
    saveData: false,
    effectiveType: "4g",
    isLowBandwidth: false,
  }),
}));

import { useAuth } from "@/lib/auth-context";

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const createAuthState = (user: User | null = null) => ({
  user,
  isLoading: false,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
});

const createUser = (overrides: Partial<User>): User => ({
  id: "1",
  email: "user@example.com",
  name: "Test User",
  role: "CANDIDATE",
  ...overrides,
});

describe('Header Components', () => {

    it('renders logo and basic navigation links', () => {
        render(<Header />)

        // Check if branding is present
        expect(screen.getByText('AfriTalent')).toBeInTheDocument()

        // Check public links
        expect(screen.getByText('Find Jobs')).toBeInTheDocument()
        expect(screen.getByText('Companies')).toBeInTheDocument()
    })

    it('renders sign in/up buttons when user is not authenticated', () => {
        mockedUseAuth.mockReturnValue(createAuthState())

        render(<Header />)
        expect(screen.getAllByText('Login')[0]).toBeInTheDocument()
        expect(screen.getAllByText('Get Started')[0]).toBeInTheDocument()
    })

    it('renders user profile navigation when a candidate is authenticated', () => {
        mockedUseAuth.mockReturnValue(
            createAuthState(
                createUser({ id: '1', role: 'CANDIDATE', name: 'John Candidate' })
            )
        )

        render(<Header />)

        // Dashboard lives in the avatar menu
        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
        expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'AI Assistant' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument()
        // Should not show employer-specific links
        expect(screen.queryByText('My Jobs')).not.toBeInTheDocument()
    })

    it('renders employer specific navigation when an employer is authenticated', () => {
        mockedUseAuth.mockReturnValue(
            createAuthState(
                createUser({ id: '2', role: 'EMPLOYER', name: 'Tech Corp' })
            )
        )

        render(<Header />)

        // Name is on the avatar trigger; Dashboard is inside the menu
        expect(screen.getByText('Tech Corp')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
        expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: 'AI Assistant' })).not.toBeInTheDocument()
    })

    it('collapses secondary links into the More menu', () => {
        mockedUseAuth.mockReturnValue(createAuthState())

        render(<Header />)

        expect(screen.queryByRole('menuitem', { name: 'Salaries' })).not.toBeInTheDocument()
        const more = screen.getByRole('button', { name: 'More links' })
        fireEvent.click(more)
        expect(more).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('menuitem', { name: 'Salaries' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Trust' })).toBeInTheDocument()

        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('menuitem', { name: 'Salaries' })).not.toBeInTheDocument()
    })

    it('renders nothing on admin routes (the console has its own shell)', () => {
        const navigation = jest.requireMock('next/navigation') as { usePathname: () => string }
        const original = navigation.usePathname
        navigation.usePathname = () => '/fr/admin/users'
        try {
            const { container } = render(<Header />)
            expect(container).toBeEmptyDOMElement()
        } finally {
            navigation.usePathname = original
        }
    })
})

describe('isAdminPath', () => {
    it('matches /admin with and without a locale prefix only', () => {
        expect(isAdminPath('/admin')).toBe(true)
        expect(isAdminPath('/admin/users')).toBe(true)
        expect(isAdminPath('/pt/admin/jobs')).toBe(true)
        expect(isAdminPath('/en')).toBe(false)
        expect(isAdminPath('/en/administration')).toBe(false)
        expect(isAdminPath('/jobs/admin')).toBe(false)
        expect(isAdminPath(null)).toBe(false)
    })
})
