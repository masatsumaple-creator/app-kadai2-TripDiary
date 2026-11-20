import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GeocodeController } from './geocode.controller.js';
import { AwsReverseGeocoder, ReverseGeocoder } from './reverse-geocoder.js';

@Module({
  imports: [AuthModule],
  controllers: [GeocodeController],
  providers: [{ provide: ReverseGeocoder, useClass: AwsReverseGeocoder }],
})
export class GeocodeModule {}
