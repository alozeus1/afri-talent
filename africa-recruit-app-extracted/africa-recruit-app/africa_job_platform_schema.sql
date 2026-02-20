
-- Africa Global Talent Platform – PostgreSQL Schema (MVP)
--
-- Enumerated types for roles and statuses
CREATE TYPE user_role AS ENUM ('candidate', 'employer', 'admin');
CREATE TYPE job_status AS ENUM ('pending', 'active', 'closed');
CREATE TYPE application_status AS ENUM ('applied', 'under_review', 'shortlisted', 'hired', 'rejected');

-- Users table stores authentication data and role assignment
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Candidate profiles contain personal and professional information
CREATE TABLE candidate_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    country VARCHAR(3),
    summary TEXT,
    skills TEXT[],
    experience_years INTEGER,
    education TEXT,
    resume_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_candidate_resume FOREIGN KEY (resume_id) REFERENCES resumes(id)
);

-- Resumes are stored separately to keep file metadata and maintain 1:1 relation
CREATE TABLE resumes (
    id SERIAL PRIMARY KEY,
    candidate_profile_id INTEGER UNIQUE REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Company information for employers
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(255),
    country VARCHAR(3),
    description TEXT,
    website_url TEXT,
    logo_path TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Jobs posted by employers
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    required_skills TEXT[],
    country VARCHAR(3), -- null for remote-only jobs
    eligible_countries TEXT[], -- optional list of ISO codes for remote jobs
    is_remote BOOLEAN NOT NULL DEFAULT FALSE,
    visa_sponsorship BOOLEAN NOT NULL DEFAULT FALSE,
    relocation_assistance BOOLEAN NOT NULL DEFAULT FALSE,
    category VARCHAR(100) NOT NULL,
    posted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    application_deadline TIMESTAMP,
    status job_status NOT NULL DEFAULT 'pending',
    search_vector TSVECTOR
);

-- Trigger and function to build full-text search vector
CREATE OR REPLACE FUNCTION jobs_update_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || array_to_string(NEW.required_skills, ' '));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_jobs_search_vector
BEFORE INSERT OR UPDATE ON jobs
FOR EACH ROW EXECUTE PROCEDURE jobs_update_search_vector();

-- Applications linking candidates to jobs
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    cover_letter TEXT,
    status application_status NOT NULL DEFAULT 'applied',
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, candidate_profile_id)
);

-- Indexes for performance and filtering
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_candidate_profiles_country ON candidate_profiles(country);
CREATE INDEX idx_candidate_profiles_skills ON candidate_profiles USING GIN (skills);
CREATE INDEX idx_jobs_country ON jobs(country);
CREATE INDEX idx_jobs_category ON jobs(category);
CREATE INDEX idx_jobs_is_remote ON jobs(is_remote);
CREATE INDEX idx_jobs_visa ON jobs(visa_sponsorship);
CREATE INDEX idx_jobs_relocation ON jobs(relocation_assistance);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_search_vector ON jobs USING GIN (search_vector);
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_applications_candidate_id ON applications(candidate_profile_id);

