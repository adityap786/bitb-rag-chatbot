import { Counter, Registry } from 'prom-client';
import { register as globalRegister } from './metrics';

export const tokenMintCounter = new Counter({
  name: 'token_mint_total',
  help: 'Total number of tokens minted',
  labelNames: ['tenant_id', 'status'],
  registers: [globalRegister],
});

export const corsRejectionCounter = new Counter({
  name: 'cors_rejection_total',
  help: 'Total number of CORS rejections',
  labelNames: ['tenant_id', 'origin'],
  registers: [globalRegister],
});

export const jwtFailureCounter = new Counter({
  name: 'jwt_failure_total',
  help: 'Total number of JWT verification failures',
  labelNames: ['tenant_id', 'reason'],
  registers: [globalRegister],
});
