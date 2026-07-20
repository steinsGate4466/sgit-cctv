import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  findAll() {
    return this.locations.findAll();
  }

  @Get('tree')
  tree() {
    return this.locations.tree();
  }
}
