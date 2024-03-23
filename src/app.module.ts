import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { WardsModule } from './wards/wards.module';
import { PatientsModule } from './patients/patients.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { BedsModule } from './beds/beds.module';

@Module({
    imports: [
        UsersModule,
        WardsModule,
        PatientsModule,
        HospitalsModule,
        BedsModule
    ],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
