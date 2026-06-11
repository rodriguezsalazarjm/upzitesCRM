import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  login(credentials: { email: string; password: string }) {
    // TODO: Implement authentication
    return {
      message: 'Login not yet implemented',
    };
  }

  register(userData: { email: string; password: string; name: string }) {
    // TODO: Implement registration
    return {
      message: 'Registration not yet implemented',
    };
  }
}
