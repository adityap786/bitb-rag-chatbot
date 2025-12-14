


const BASE_URL = 'http://localhost:3000';

async function main() {
    const email = `repro-test-${Date.now()}@example.com`;
    console.log('1. Creating trial with email:', email);

    const startRes = await fetch(`${BASE_URL}/api/trial/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            businessName: 'Repro Corp',
            businessType: 'service'
        })
    });

    if (!startRes.ok) {
        console.error('Failed to create trial:', await startRes.text());
        return;
    }

    const { setupToken, tenantId } = await startRes.json();
    console.log('Trial created. Token:', setupToken.substring(0, 20) + '...');

    console.log('2. Submitting Manual KB...');
    const kbRes = await fetch(`${BASE_URL}/api/trial/kb/manual`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${setupToken}`
        },
        body: JSON.stringify({
            companyInfo: 'This is a test company description for reproduction.',
            faqs: [
                { question: 'What is this?', answer: 'A test.' }
            ]
        })
    });

    if (!kbRes.ok) {
        console.error('KB Submission Failed status:', kbRes.status);
        console.error('Response:', await kbRes.text());
    } else {
        console.log('KB Submission Success:', await kbRes.json());
    }
}

main().catch(console.error);
