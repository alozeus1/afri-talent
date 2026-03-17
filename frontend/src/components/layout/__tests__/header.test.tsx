import { render, screen } from "@testing-library/react";
import { Header } from "../header";

// Mock the AuthContext since Header depends on useAuth
jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    isLoading: false,
    logout: jest.fn(),
  })),
}));

import { useAuth } from "@/lib/auth-context";

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

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
        mockedUseAuth.mockReturnValue({
            user: null,
            isLoading: false,
        })

        render(<Header />)
        expect(screen.getAllByText('Login')[0]).toBeInTheDocument()
        expect(screen.getAllByText('Get Started')[0]).toBeInTheDocument()
    })

    it('renders user profile navigation when a candidate is authenticated', () => {
        mockedUseAuth.mockReturnValue({
            user: { id: '1', role: 'CANDIDATE', name: 'John Candidate' },
            isLoading: false,
        })

        render(<Header />)

        // Auth-only links
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        // Should not show employer-specific links
        expect(screen.queryByText('My Jobs')).not.toBeInTheDocument()
    })

    it('renders employer specific navigation when an employer is authenticated', () => {
        mockedUseAuth.mockReturnValue({
            user: { id: '2', role: 'EMPLOYER', name: 'Tech Corp' },
            isLoading: false,
        })

        render(<Header />)

        // Employer-only links
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText('Tech Corp')).toBeInTheDocument()
    })
})
