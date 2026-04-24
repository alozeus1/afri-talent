import { render, screen } from '@testing-library/react'
import { Footer } from '../footer'

describe('Footer Component', () => {
    it('renders company information and copyright', () => {
        render(<Footer />)

        expect(screen.getByText('AfriTalent')).toBeInTheDocument()

        // Use a function to check for the text since it might be split across elements/lines
        const elements = screen.getAllByText((content, element) => {
            return element?.textContent?.includes('trust-first hiring platform helping global teams discover African talent') || false
        })
        expect(elements.length).toBeGreaterThan(0)

        // Check copyright year
        const year = new Date().getFullYear()
        expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument()
    })

    it('renders main navigation links', () => {
        render(<Footer />)

        // For Candidates
        expect(screen.getByText('Browse Jobs')).toBeInTheDocument()
        expect(screen.getByText('Career Resources')).toBeInTheDocument()

        // For Employers
        expect(screen.getByText('Post a Job')).toBeInTheDocument()
        expect(screen.getByText('Pricing')).toBeInTheDocument()
    })
})
