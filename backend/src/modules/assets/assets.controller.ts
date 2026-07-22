import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { SignedCreateAssetDto } from './dto/create-asset-signed.dto';
import { SignedUpdateAssetDto } from './dto/update-asset-signed.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { QueryAssetDto } from './dto/query-asset.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  // Alta FIRMADA: exige re-autenticación (firma) y queda auditada (CREATE_ASSET).
  @Post()
  @RequirePermissions('asset.create')
  create(@Body() dto: SignedCreateAssetDto, @Ip() ip: string) {
    return this.assets.createSigned(dto, ip);
  }

  @Get()
  @RequirePermissions('asset.read')
  findAll(@Query() q: QueryAssetDto, @CurrentUser() user: any) {
    const sensitive = (user?.permissions || []).includes('credential.read');
    return this.assets.findAll(q, sensitive);
  }

  @Get(':id')
  @RequirePermissions('asset.read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const sensitive = (user?.permissions || []).includes('credential.read');
    return this.assets.findOne(id, sensitive);
  }

  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(id, dto);
  }

  // Edición FIRMADA (completa): solo Jefe, Supervisor TI y Técnico de Red (credential.read).
  @Patch(':id/edit')
  @RequirePermissions('credential.read')
  editSigned(@Param('id') id: string, @Body() dto: SignedUpdateAssetDto, @Ip() ip: string) {
    return this.assets.updateSigned(id, dto, ip);
  }

  // Editar datos de red sensibles (IP): solo Jefe de Mantenimiento y Técnico de Red.
  @Patch(':id/network')
  @RequirePermissions('credential.manage')
  updateNetwork(@Param('id') id: string, @Body() dto: UpdateNetworkDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.assets.updateNetwork(id, dto, ip, user?.userId);
  }

  @Delete(':id')
  @RequirePermissions('asset.delete')
  remove(@Param('id') id: string) {
    return this.assets.remove(id);
  }
}
