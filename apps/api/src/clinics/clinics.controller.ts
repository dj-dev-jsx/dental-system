import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';

@Controller('clinics')
export class ClinicsController {
    // Has @Public(), so anyone can open it.
    @Public()
    @Get('hello')
    hello() {
        return { message: 'Hello from ClinicsController!' };
    }
}
