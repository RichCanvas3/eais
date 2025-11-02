'use client';
import * as React from 'react';
import { Button } from '@mui/material';
import { useWeb3Auth } from './Web3AuthProvider';

export function Web3AuthButton() {
  const { isLoggedIn, login, logout, address } = useWeb3Auth();
  return (
    <Button 
      variant="contained" 
      onClick={isLoggedIn ? logout : login} 
      disableElevation
      sx={{
        backgroundColor: 'rgb(31, 136, 61)',
        color: '#ffffff',
        '&:hover': {
          backgroundColor: 'rgb(26, 115, 51)',
        },
      }}
    >
      {isLoggedIn ? (address ? address.slice(0, 6) + '…' + address.slice(-4) : 'Logout') : 'Login'}
    </Button>
  );
}


