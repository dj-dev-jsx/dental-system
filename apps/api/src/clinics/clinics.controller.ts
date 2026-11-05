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

    // EXAMPLE: no @Public() and no login code, like a developer forgot to protect it.
    // SessionGuard still blocks anyone who isn't logged in.
    @Get('patients-export')
    exportAllPatients() {
        return { patients: ['Fake Patient 1', 'Fake Patient 2'] };
    }
}