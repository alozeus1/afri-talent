import { render, screen } from "@testing-library/react";
import { Header } from "../header";
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

        // Auth-only links
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
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

        // Employer-only links
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText('Tech Corp')).toBeInTheDocument()
    })
})
