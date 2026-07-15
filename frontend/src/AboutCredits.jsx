import gadcLogo from './assets/GADC LOGO.jpg';

export default function AboutCredits() {
    return (
        <div className="about-page">
            <div className="about-hero">
                <h1 className="about-title">About the System</h1>
                <div className="about-badge">Version 1.0</div>
            </div>

            <div className="about-card">
                <h2>San Pascual E-TaxMap</h2>
                <p className="about-tagline">Electronic Tax Mapping System · Municipality of San Pascual, Batangas</p>

                <p>
                    The E-TaxMap System is a web-based Geographic Information System (GIS) developed for the Municipality
                    of San Pascual, Batangas. It digitizes and manages the Real Property Tax Map (RPTM) of the municipality,
                    providing local government units with a modern tool for tracking land parcels, barangay boundaries,
                    section data, lot ownership, and property valuation.
                </p>

                <p>
                    Designed to support the Municipal Assessor's Office in monitoring property records, detecting data gaps,
                    and generating reports for tax assessment and cadastral mapping purposes under the Local Government Code
                    of the Philippines.
                </p>
            </div>

            <div className="about-card">
                <h2>Credits</h2>
                <p>This system was conceptualized, designed, and developed by:</p>

                <div className="credits-list">
                    <div className="credit-person">Bautista, Hansine Lauraine M.</div>
                    <div className="credit-person">Lopez, Angel Rhose A.</div>
                    <div className="credit-person">Padilla, Idris Laurence U.</div>
                </div>

                <p>
                    As OJTs at the GADC - GIS Applications Development Center, these developers collaboratively created this
                    website for the thesis of Geodetic Engineering students, integrating geospatial technologies, system
                    architecture, database management, and user interface development to create a functional and efficient
                    academic platform.
                </p>

                <p>
                    Their dedication, technical expertise, and commitment to innovation made this system possible,
                    contributing to the advancement of digital solutions within the geodetic field.
                </p>
            </div>

            <div className="about-card">
                <h2>Institutional Support</h2>

                <p>
                    The successful development of this system was made possible through the support of the{' '}
                    <strong>Office of GIS Applications Development Center (GADC)</strong>, which provided technical guidance,
                    institutional resources, and continuous assistance to both the developers and the thesis students
                    throughout the project.
                </p>

                <p>Special recognition is given to:</p>

                <div className="credit-highlight">
                    <img src={gadcLogo} alt="GADC Logo" className="gadc-credit-logo" />
                    <div className="credit-highlight-info">
                        <div className="credit-name">Engr. Erwin Rafael D. Cabral</div>
                        <div className="credit-role">Head, GIS Applications Development Center (GADC)</div>
                        <div className="credit-role">Thesis Adviser</div>
                    </div>
                </div>

                <p>
                    Engr. Cabral's leadership, mentorship, and expert guidance were instrumental in shaping the direction,
                    technical refinement, and successful completion of this project. His unwavering support greatly
                    contributed to both the professional growth of the developers and the realization of this system.
                </p>
            </div>
        </div>
    );
}
