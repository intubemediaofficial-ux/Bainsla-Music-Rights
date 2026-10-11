/** Platform starter templates. They are placeholders for counsel review, not legal advice. */
const NOTICE_EN = '<div class="notice">STARTER TEMPLATE — must be reviewed and approved by qualified legal counsel before use. Unsigned drafts are not evidence of ownership.</div>';
const NOTICE_HI = '<div class="notice">स्टार्टर टेम्पलेट — उपयोग से पहले योग्य वकील द्वारा समीक्षा और स्वीकृति आवश्यक है। बिना हस्ताक्षर का ड्राफ्ट स्वामित्व का प्रमाण नहीं है।</div>';

export const STARTER_TEMPLATES = [
  {
    kind: 'AGREEMENT' as const, language: 'en', name: 'Copyright Assignment Agreement (English)',
    body: `${NOTICE_EN}<h1>{{agreement.title}}</h1>
<p>This Agreement is made on <b>{{agreement.effective_date}}</b> between:</p>
<ol>{{#parties}}<li><b>{{name}}</b>{{#address}}, {{address}}{{/address}} — hereinafter the <b>{{role}}</b>.</li>{{/parties}}</ol>
<h2>1. Assignment</h2><p>The Assignor assigns to the Assignee the {{agreement.rights}} in the musical works and sound recordings listed in Annexure-A, for the territory <b>{{agreement.territories}}</b>{{#agreement.expiry_date}} until {{agreement.expiry_date}}{{/agreement.expiry_date}}.</p>
<h2>2. Consideration</h2><p>{{consideration.currency}} {{consideration.amount}}. {{consideration.terms}}</p>
<h2>3. Warranties</h2><p>{{clauses.warranties}}</p>
<h2>4. Governing law</h2><p>This Agreement is governed by the laws of {{clauses.governing_law}}; courts at {{clauses.jurisdiction}} have exclusive jurisdiction.</p>
{{#clauses.additional}}<h2>5. Additional terms</h2><p>{{clauses.additional}}</p>{{/clauses.additional}}
<p>Annexure-A ({{annexure_count}} item(s)) forms part of this Agreement.</p>
{{{signature_block}}}
<div class="pb"></div><h1>Annexure-A</h1>{{{annexure_table}}}`,
  },
  {
    kind: 'AGREEMENT' as const, language: 'hi', name: 'कॉपीराइट असाइनमेंट समझौता (हिंदी)',
    body: `${NOTICE_HI}<h1>{{agreement.title}}</h1>
<p>यह समझौता दिनांक <b>{{agreement.effective_date}}</b> को निम्नलिखित पक्षों के बीच किया गया है:</p>
<ol>{{#parties}}<li><b>{{name}}</b>{{#address}}, {{address}}{{/address}} — आगे <b>{{role}}</b> कहा जाएगा।</li>{{/parties}}</ol>
<h2>1. असाइनमेंट</h2><p>असाइनर, अनुलग्नक-ए में सूचीबद्ध संगीत रचनाओं और ध्वनि रिकॉर्डिंग के {{agreement.rights}} अधिकार, क्षेत्र <b>{{agreement.territories}}</b> हेतु असाइनी को सौंपता है।</p>
<h2>2. प्रतिफल</h2><p>{{consideration.currency}} {{consideration.amount}}। {{consideration.terms}}</p>
<h2>3. आश्वासन</h2><p>{{clauses.warranties}}</p>
<h2>4. लागू कानून</h2><p>यह समझौता {{clauses.governing_law}} के कानूनों द्वारा शासित होगा; {{clauses.jurisdiction}} के न्यायालयों का विशेष क्षेत्राधिकार होगा।</p>
{{#clauses.additional}}<h2>5. अतिरिक्त शर्तें</h2><p>{{clauses.additional}}</p>{{/clauses.additional}}
<p>अनुलग्नक-ए ({{annexure_count}} गीत) इस समझौते का भाग है।</p>
{{{signature_block}}}
<div class="pb"></div><h1>अनुलग्नक-ए (Annexure-A)</h1>{{{annexure_table}}}`,
  },
  {
    kind: 'NOC' as const, language: 'en', name: 'No Objection Certificate (English)',
    body: `${NOTICE_EN}<h1>No Objection Certificate</h1>
<p>Date: {{date}}</p>
<p>I/We, <b>{{party.name}}</b>{{#party.address}}, {{party.address}}{{/party.address}}, confirm that I/we have no objection to <b>{{org.legal_name}}</b> exercising the rights described in the agreement "{{agreement.title}}" dated {{agreement.effective_date}} in respect of the works and recordings listed below, for the territory {{agreement.territories}}.</p>
{{{annexure_table}}}
<div class="sig"><div>{{party.name}}<br/>Signature &amp; date</div></div>`,
  },
  {
    kind: 'NOC' as const, language: 'hi', name: 'अनापत्ति प्रमाण पत्र (हिंदी)',
    body: `${NOTICE_HI}<h1>अनापत्ति प्रमाण पत्र (NOC)</h1>
<p>दिनांक: {{date}}</p>
<p>मैं/हम, <b>{{party.name}}</b>{{#party.address}}, {{party.address}}{{/party.address}}, पुष्टि करते हैं कि समझौता "{{agreement.title}}" दिनांक {{agreement.effective_date}} के अंतर्गत नीचे सूचीबद्ध रचनाओं और रिकॉर्डिंग के संबंध में <b>{{org.legal_name}}</b> द्वारा अधिकारों के प्रयोग पर क्षेत्र {{agreement.territories}} हेतु मुझे/हमें कोई आपत्ति नहीं है।</p>
{{{annexure_table}}}
<div class="sig"><div>{{party.name}}<br/>हस्ताक्षर एवं दिनांक</div></div>`,
  },
];
