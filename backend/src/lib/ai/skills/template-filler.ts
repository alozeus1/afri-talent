/**
 * Template Filler — Auto-fill HTML resume templates with candidate profile data.
 *
 * Uses Cheerio to manipulate the template DOM and inject user-specific content
 * while preserving the original CSS styling and layout.
 */

import * as cheerio from "cheerio";
import type { GeneratedResume } from "./resume-builder.js";

export interface FillInput {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  resume: GeneratedResume;
}

/**
 * Fill an HTML resume template with candidate data.
 */
export function fillTemplate(html: string, input: FillInput): string {
  const $ = cheerio.load(html);

  // 1. Header — name
  $(".header-left .name, .name").first().text(input.fullName);

  // 2. Header — contact info (right side or header block)
  const headerRight = $(".header-right").first();
  if (headerRight.length) {
    let contactHtml = headerRight.html() || "";
    contactHtml = replacePlaceholder(contactHtml, "[Email Address]", input.email);
    contactHtml = replacePlaceholder(contactHtml, "[Email]", input.email);
    contactHtml = replacePlaceholder(contactHtml, "[Phone Number]", input.phone || "");
    contactHtml = replacePlaceholder(contactHtml, "[Phone]", input.phone || "");
    contactHtml = replacePlaceholder(contactHtml, "[City, State]", input.location || "");
    contactHtml = replacePlaceholder(contactHtml, "[City, State / Remote]", input.location ? `${input.location} (Open to Remote)` : "Open to Remote");
    contactHtml = replacePlaceholder(contactHtml, "[profile]", input.linkedinUrl || input.portfolioUrl || "");
    contactHtml = replacePlaceholder(contactHtml, "[username]", input.githubUrl ? input.githubUrl.replace(/https:\/\/github\.com\//, "") : "");
    contactHtml = replacePlaceholder(contactHtml, "[yourprofile]", input.linkedinUrl || input.portfolioUrl || "");
    headerRight.html(contactHtml);
  }

  // 3. Professional Summary / Executive Profile
  const summarySection = $(".section.summary, .section.exec-summary").first();
  if (summarySection.length && input.resume.sections.summary) {
    summarySection.find("p").first().html(input.resume.sections.summary);
  }

  // 4. Work Experience — replace .job blocks
  const experienceSection = $(".section").filter((_, el) => {
    const title = $(el).find(".section-title").first().text().trim().toLowerCase();
    return title.includes("experience") || title.includes("clinical experience") || title.includes("career");
  }).first();

  if (experienceSection.length) {
    const jobBlocks = experienceSection.find(".job");
    const firstJob = jobBlocks.first();

    if (firstJob.length && input.resume.sections.experience.length > 0) {
      // Store the first job as a template, then clear all existing jobs
      const jobTemplate = firstJob.clone();
      jobBlocks.remove();

      for (const exp of input.resume.sections.experience) {
        const newJob = jobTemplate.clone();
        newJob.find(".job-title").first().text(exp.title);
        newJob.find(".date-range").first().text(exp.period);

        const employerEl = newJob.find(".employer").first();
        if (employerEl.length) {
          let employerHtml = employerEl.html() || "";
          employerHtml = replacePlaceholder(employerHtml, "[Company Name]", exp.company);
          employerHtml = replacePlaceholder(employerHtml, "[Company]", exp.company);
          employerEl.html(employerHtml);
        }

        // Replace bullets
        const bulletsUl = newJob.find("ul.bullets").first();
        if (bulletsUl.length && exp.bullets.length > 0) {
          bulletsUl.empty();
          for (const bullet of exp.bullets) {
            bulletsUl.append(`<li>${bullet}</li>`);
          }
        }

        experienceSection.append(newJob);
      }
    }
  }

  // 5. Education — replace .edu-item blocks
  const eduSection = $(".section").filter((_, el) => {
    const title = $(el).find(".section-title").first().text().trim().toLowerCase();
    return title === "education";
  }).first();

  if (eduSection.length) {
    const eduItems = eduSection.find(".edu-item");
    const firstEdu = eduItems.first();

    if (firstEdu.length && input.resume.sections.education.length > 0) {
      const eduTemplate = firstEdu.clone();
      eduItems.remove();

      for (const edu of input.resume.sections.education) {
        const newEdu = eduTemplate.clone();
        newEdu.find(".edu-degree").first().text(edu.degree);
        newEdu.find(".edu-school").first().html(replacePlaceholder(newEdu.find(".edu-school").first().html() || "", "[University Name]", edu.institution));
        newEdu.find(".edu-meta").first().html(replacePlaceholder(newEdu.find(".edu-meta").first().html() || "", "[City, State]", input.location || ""));
        eduSection.append(newEdu);
      }
    }
  }

  // 6. Skills — try to replace skills list if present
  const skillsSection = $(".section").filter((_, el) => {
    const title = $(el).find(".section-title").first().text().trim().toLowerCase();
    return title.includes("skill") || title.includes("competenc");
  }).first();

  if (skillsSection.length && input.resume.sections.skills.length > 0) {
    const skillsContainer = skillsSection.find(".skills-grid, .skills-list, .tag-list").first();
    if (skillsContainer.length) {
      skillsContainer.empty();
      for (const skill of input.resume.sections.skills) {
        skillsContainer.append(`<span class="skill-tag">${skill}</span>`);
      }
    }
  }

  // 7. Certifications
  if (input.resume.sections.certifications.length > 0) {
    const certSection = $(".section").filter((_, el) => {
      const title = $(el).find(".section-title").first().text().trim().toLowerCase();
      return title.includes("certification") || title.includes("licensure");
    }).first();

    if (certSection.length) {
      const certContainer = certSection.find("ul, .cert-list").first();
      if (certContainer.length) {
        certContainer.empty();
        for (const cert of input.resume.sections.certifications) {
          certContainer.append(`<li>${cert}</li>`);
        }
      }
    }
  }

  return $.html();
}

function replacePlaceholder(text: string, placeholder: string, value: string): string {
  if (!text) return value || "";
  return text.split(placeholder).join(value || placeholder);
}
