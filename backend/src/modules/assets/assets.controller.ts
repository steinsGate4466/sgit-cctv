import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { QueryAssetDto } from './dto/query-asset.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  @RequirePermissions('asset.create')
  create(@Body() dto: CreateAssetDto) {
    return this.assets.create(dto);
  }

  @Get()
  @RequirePermissions('asset.read')
  findAll(@Query() q: QueryAssetDto) {
    return this.assets.findAll(q);
  }

  @Get(':id')
  @RequirePermissions('asset.read')
  findOne(@Param('id') id: string) {
    return this.assets.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('asset.delete')
  remove(@Param('id') id: string) {
    return this.assets.remove(id);
  }
}
