import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CabinetsService } from './cabinets.service';
import { CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('cabinets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cabinets')
export class CabinetsController {
  constructor(private readonly cabinets: CabinetsService) {}

  @Get()
  @RequirePermissions('asset.read')
  list(@Query('tren') tren?: string, @Query('etapa') etapa?: string) {
    return this.cabinets.list({ tren, etapa });
  }

  // Foto del gabinete (previsualización).
  @Get(':id/photo')
  @RequirePermissions('asset.read')
  async photo(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType } = await this.cabinets.getPhoto(id);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermissions('asset.read')
  findOne(@Param('id') id: string) {
    return this.cabinets.findOne(id);
  }

  @Post()
  @RequirePermissions('asset.update')
  create(@Body() dto: CreateCabinetDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cabinets.create(dto, user?.userId, ip);
  }

  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id') id: string, @Body() dto: UpdateCabinetDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cabinets.update(id, dto, user?.userId, ip);
  }

  @Delete(':id')
  @RequirePermissions('asset.update')
  remove(@Param('id') id: string) {
    return this.cabinets.remove(id);
  }

  @Post(':id/photo')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: any) {
    return this.cabinets.uploadPhoto(id, file);
  }
}
