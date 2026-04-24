function hasItems(value) {
    return Array.isArray(value) && value.length > 0;
}
export function computeProfileCompleteness(profile) {
    let score = 0;
    if (profile.headline)
        score += 10;
    if (profile.bio)
        score += 12;
    if (profile.skills.length > 0)
        score += 15;
    if (profile.targetRoles.length > 0)
        score += 8;
    if (profile.targetCountries.length > 0)
        score += 6;
    if (profile.yearsExperience != null)
        score += 8;
    if (profile.visaStatus)
        score += 5;
    if (profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl)
        score += 8;
    if (hasItems(profile.workHistory))
        score += 12;
    if (hasItems(profile.educationHistory))
        score += 8;
    if (hasItems(profile.certifications))
        score += 4;
    if (profile.resumes && profile.resumes.length > 0)
        score += 4;
    return score;
}
//# sourceMappingURL=profile-completeness.js.map