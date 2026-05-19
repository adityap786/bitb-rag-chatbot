import * as prom from 'prom-client';
console.log('PromClient keys:', Object.keys(prom));
try {
    const reg = new prom.Registry();
    console.log('Registry created');
} catch (e) {
    console.error('Registry failed', e);
}
