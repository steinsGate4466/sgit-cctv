import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateSpareDto } from './dto/create-spare.dto';
import { UpdateSpareDto } from './dto/update-spare.dto';
import { QuerySpareDto } from './dto/query-spare.dto';
import { MovementDto } from './dto/movement.dto';
import { CheckDto } from './dto/check.dto';
import { LinkAssetDto } from './dto/link-asset.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  // Panel de inventario (campo vs repuestos, faltantes, sin comprobar).
  @Get('summary')
  @RequirePermissions('inventory.read')
  summary() { return this.inv.summary(); }

  @Get()
  @RequirePermissions('inventory.read')
  findAll(@Query() q: QuerySpareDto) { return this.inv.findAll(q); }

  // Repuestos compatibles con un activo (por vínculo o modelo).
  @Get('for-asset/:assetId')
  @RequirePermissions('inventory.read')
  forAsset(@Param('assetId') assetId: string) { return this.inv.sparesForAsset(assetId); }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(@Param('id') id: string) { return this.inv.findOne(id); }

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateSpareDto) { return this.inv.create(dto); }

  @Patch(':id')
  @RequirePermissions('inventory.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSpareDto) { return this.inv.update(id, dto); }

  @Delete(':id')
  @RequirePermissions('inventory.manage')
  remove(@Param('id') id: string) { return this.inv.remove(id); }

  @Post(':id/link')
  @RequirePermissions('inventory.manage')
  link(@Param('id') id: string, @Body() dto: LinkAssetDto) { return this.inv.linkAsset(id, dto); }

  @Delete(':id/link/:assetId')
  @RequirePermissions('inventory.manage')
  unlink(@Param('id') id: string, @Param('assetId') assetId: string) { return this.inv.unlinkAsset(id, assetId); }

  // Movimiento de stock (ingreso/retiro/ajuste) — retiro por código SAP.
  @Post(':id/movement')
  @RequirePermissions('inventory.check')
  movement(@Param('id') id: string, @Body() dto: MovementDto, @CurrentUser() user: any) {
    return this.inv.registerMovement(id, dto, user?.userId);
  }

  // Comprobación física (control diario del almacén).
  @Post(':id/check')
  @RequirePermissions('inventory.check')
  check(@Param('id') id: string, @Body() dto: CheckDto, @CurrentUser() user: any) {
    return this.inv.registerCheck(id, dto, user?.userId);
  }
}
