import { PartialType } from '@nestjs/swagger';
import { CreateSpareDto } from './create-spare.dto';

export class UpdateSpareDto extends PartialType(CreateSpareDto) {}
