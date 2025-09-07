# Environment Variable Setup

## Required Environment Variables

Add the following environment variable to your `.env.local` file in the `apps/web/` directory:

```bash
# ENS Identity Wrapper Contract Address
NEXT_PUBLIC_ENS_IDENTITY_WRAPPER=0x0635513f179D50A207757E05759CbD106d7dFcE8
```

## How to Add

1. Navigate to the `apps/web/` directory
2. Create or edit `.env.local` file
3. Add the environment variable above
4. Restart your development server

## Fallback

If the environment variable is not set, the code will fallback to the hardcoded address `0x0635513f179D50A207757E05759CbD106d7dFcE8`.

## Files Updated

The following files have been updated to use the environment variable:

- `apps/web/components/AgentTable.tsx`
- `apps/web/service/ensService.ts`

All references to the hardcoded ENS Identity Wrapper address have been replaced with the environment variable with fallback to the original address.
