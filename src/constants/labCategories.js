/**
 * Laboratory Categories based on UNESCO Field of Science and Technology (FOS) Classification
 * and extended with more granular subcategories for laboratory sciences
 * 
 * This classification provides a comprehensive and standardized taxonomy for categorizing
 * scientific laboratories across multiple disciplines.
 */

export const LAB_CATEGORIES = [
  // Natural Sciences
  'Mathematics',
  'Statistics & Probability',
  'Computer Science',
  'Artificial Intelligence & Machine Learning',
  'Data Science',
  'Cybersecurity',
  'Software Engineering',
  
  // Physical Sciences
  'Physics',
  'Nuclear Physics',
  'Particle Physics',
  'Astronomy & Astrophysics',
  'Optics & Photonics',
  'Condensed Matter Physics',
  
  // Chemical Sciences
  'Chemistry',
  'Organic Chemistry',
  'Inorganic Chemistry',
  'Physical Chemistry',
  'Analytical Chemistry',
  'Biochemistry',
  'Pharmaceutical Chemistry',
  
  // Earth & Space Sciences
  'Geology',
  'Geophysics',
  'Meteorology',
  'Oceanography',
  'Environmental Sciences',
  'Climate Science',
  
  // Biological Sciences
  'Biology',
  'Molecular Biology',
  'Cell Biology',
  'Genetics',
  'Microbiology',
  'Botany',
  'Zoology',
  'Ecology',
  'Marine Biology',
  'Neuroscience',
  'Biotechnology',
  
  // Engineering & Technology
  'Civil Engineering',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Electronic Engineering',
  'Telecommunications Engineering',
  'Chemical Engineering',
  'Materials Engineering',
  'Aerospace Engineering',
  'Robotics',
  'Automation & Control Systems',
  'Nanotechnology',
  'Biomedical Engineering',
  
  // Medical & Health Sciences
  'Medicine',
  'Clinical Medicine',
  'Pharmacology',
  'Toxicology',
  'Pathology',
  'Immunology',
  'Public Health',
  'Nursing',
  'Medical Imaging',
  'Laboratory Medicine',
  
  // Agricultural & Veterinary Sciences
  'Agriculture',
  'Animal Science',
  'Veterinary Medicine',
  'Forestry',
  'Fisheries',
  'Soil Science',
  'Agricultural Engineering',
  
  // Social Sciences
  'Psychology',
  'Experimental Psychology',
  'Cognitive Science',
  'Economics',
  'Experimental Economics',
  'Sociology',
  'Political Science',
  'Anthropology',
  
  // Humanities
  'Linguistics',
  'Computational Linguistics',
  'Digital Humanities',
  'Archaeology',
  
  // Multidisciplinary & Other
  'Environmental Engineering',
  'Energy Engineering',
  'Renewable Energy',
  'Food Science & Technology',
  'Quality Control',
  'Metrology',
  'Other'
]

/**
 * Grouped categories for better UI organization
 */
export const LAB_CATEGORIES_GROUPED = {
  'Mathematics & Computer Science': [
    'Mathematics',
    'Statistics & Probability',
    'Computer Science',
    'Artificial Intelligence & Machine Learning',
    'Data Science',
    'Cybersecurity',
    'Software Engineering'
  ],
  
  'Physical Sciences': [
    'Physics',
    'Nuclear Physics',
    'Particle Physics',
    'Astronomy & Astrophysics',
    'Optics & Photonics',
    'Condensed Matter Physics'
  ],
  
  'Chemical Sciences': [
    'Chemistry',
    'Organic Chemistry',
    'Inorganic Chemistry',
    'Physical Chemistry',
    'Analytical Chemistry',
    'Biochemistry',
    'Pharmaceutical Chemistry'
  ],
  
  'Earth & Space Sciences': [
    'Geology',
    'Geophysics',
    'Meteorology',
    'Oceanography',
    'Environmental Sciences',
    'Climate Science'
  ],
  
  'Biological Sciences': [
    'Biology',
    'Molecular Biology',
    'Cell Biology',
    'Genetics',
    'Microbiology',
    'Botany',
    'Zoology',
    'Ecology',
    'Marine Biology',
    'Neuroscience',
    'Biotechnology'
  ],
  
  'Engineering & Technology': [
    'Civil Engineering',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Electronic Engineering',
    'Telecommunications Engineering',
    'Chemical Engineering',
    'Materials Engineering',
    'Aerospace Engineering',
    'Robotics',
    'Automation & Control Systems',
    'Nanotechnology',
    'Biomedical Engineering'
  ],
  
  'Medical & Health Sciences': [
    'Medicine',
    'Clinical Medicine',
    'Pharmacology',
    'Toxicology',
    'Pathology',
    'Immunology',
    'Public Health',
    'Nursing',
    'Medical Imaging',
    'Laboratory Medicine'
  ],
  
  'Agricultural & Veterinary Sciences': [
    'Agriculture',
    'Animal Science',
    'Veterinary Medicine',
    'Forestry',
    'Fisheries',
    'Soil Science',
    'Agricultural Engineering'
  ],
  
  'Social Sciences': [
    'Psychology',
    'Experimental Psychology',
    'Cognitive Science',
    'Economics',
    'Experimental Economics',
    'Sociology',
    'Political Science',
    'Anthropology'
  ],
  
  'Humanities': [
    'Linguistics',
    'Computational Linguistics',
    'Digital Humanities',
    'Archaeology'
  ],
  
  'Multidisciplinary & Other': [
    'Environmental Engineering',
    'Energy Engineering',
    'Renewable Energy',
    'Food Science & Technology',
    'Quality Control',
    'Metrology',
    'Other'
  ]
}
