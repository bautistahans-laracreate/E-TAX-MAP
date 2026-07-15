import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FAQ_DATA = [
    {
        q: 'What is the San Pascual E-TaxMap System?',
        a: 'The E-TaxMap System is a web-based Geographic Information System (GIS) developed for the Municipality of San Pascual, Batangas. It digitizes and manages the Real Property Tax Map (RPTM), providing local government units with a modern tool for tracking land parcels, barangay boundaries, section data, lot ownership, and property valuation.'
    },
    {
        q: "How many barangays are in the municipality of San Pascual?",
        a: "San Pascual, Batangas has 29 barangays: Alalum, Antipolo, Balimbing, Banaba, Bayanan, Danglayan, Del Pilar, Gelerang Kawayan, Ilat North, Ilat South, Kaingin, Laurel, Malaking Pook, Mataas na Lupa, Natunuan North, Natunuan South, Padre Castillo, Palsahingin, Pila, Poblacion, Pook ni Banal, Pook ni Kapitan, Resplandor, Sambat, San Antonio, San Mariano, San Mateo, Santa Elena, and Santo Niño."
    },
    {
        q: 'What is a Section in the E-TaxMap?',
        a: 'A Section is a subdivision of a barangay. Even if a barangay is divided into multiple parts or sections, they all belong to the same barangay. Sections help organize land parcels/lots for assessment and mapping purposes.'
    },
    {
        q: 'What is a Lot/Parcel?',
        a: 'A lot or parcel is a specific piece of land within a section. Each lot has associated data such as owner name, address, PIN (Property Identification Number), market value, assessment value, RPT (Real Property Tax), land use classification, and area in square meters.'
    },
    {
        q: 'What does the Dashboard show?',
        a: 'The Dashboard provides an overview of the municipality\'s tax mapping data, including the total number of barangays, sections, and lots/parcels. It also displays Land Use Distribution (bar chart) and Land Use Share (pie chart) to visualize property classifications. Admin users can additionally see system issues and generate reports.'
    },
    {
        q: 'What is the CAD Map Overview?',
        a: 'The CAD (Cadastral) Map Overview is a static map that displays the barangay boundaries of the municipality of San Pascual. Each barangay is color-coded, and a legend on the side shows which color corresponds to which barangay. This map is for viewing purposes only and cannot be panned or zoomed.'
    },
    {
        q: 'What is the PIM Map Overview?',
        a: 'The PIM (Property Index Map) Overview is an interactive map where you can view the entire municipality of San Pascual. Clicking on a barangay shows its details. Selecting a section within a barangay shows section-specific information. You can then view individual lot details through a dropdown.'
    },
    {
        q: 'What types of land use classifications exist?',
        a: 'Land parcels can be classified as Residential, Agricultural, Commercial, or Industrial. Some lots may have mixed classifications — for example, a lot can be both Residential and Agricultural, or even have three or four classifications simultaneously.'
    },
    {
        q: "What are System Issues?",
        a: "System Issues are data integrity problems detected within the E-TaxMap system. These include missing lot information (such as missing owner name, PIN, or market value), barangays not yet loaded, or sections without lots. Admin users can view and resolve these issues."
    },
    {
        q: 'How do I generate a report?',
        a: 'From the Main Dashboard (admin only), click the "Reports & Analytics" button near the Issues Found table. This will show a printable A4-format preview of all current issues. You can export this report as a PDF or Excel file.'
    },
    {
        q: 'What is the difference between Admin and User accounts?',
        a: 'Admin accounts have full access to the system including user management, issue tracking, and report generation. User accounts have read-only access to the dashboard statistics, charts, and map views, with limited property details (PIN, area, and land use only).'
    },
    {
        q: 'What does PIN stand for?',
        a: 'PIN stands for Property Identification Number. It is a unique number assigned to each lot/parcel for identification and tax assessment purposes. The format typically follows the pattern: Municipality Code – Barangay Code – Section Number – Lot Number.'
    },
];

export default function FAQs() {
    const [openIndex, setOpenIndex] = useState(null);

    const toggle = (i) => setOpenIndex(openIndex === i ? null : i);

    return (
        <div className="faq-page">
            <h1 className="faq-title">Frequently Asked Questions</h1>
            <p className="faq-subtitle">Find answers to common questions about the San Pascual E-TaxMap System.</p>

            <div className="faq-list">
                {FAQ_DATA.map((item, i) => (
                    <div key={i} className={`faq-item ${openIndex === i ? 'open' : ''}`}>
                        <button className="faq-question" onClick={() => toggle(i)}>
                            <span>{item.q}</span>
                            {openIndex === i ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                        {openIndex === i && (
                            <div className="faq-answer">{item.a}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
