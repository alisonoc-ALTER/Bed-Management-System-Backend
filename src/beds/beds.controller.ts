import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Headers,
    Param,
    Patch,
    Post,
    Query
} from '@nestjs/common';
import { BedsService } from './beds.service';
import { CreateBedOccupancyDto } from './dto/createBedOccupancy.dto';
import { CheckoutBedOccupancyDto } from './dto/checkoutBedOccupancy.dto';
import { BedDto } from './dto/Bed.dto';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from 'src/users/users.service';
import { WardsService } from 'src/wards/wards.service';
import * as dotenv from 'dotenv';
import { Bed } from './entities/bed.entity';
import { BedStatus } from './entities/bedStatus.entity';
import { BedOccupancy } from './entities/bedOccupancy.entity';
import { DisabledReason } from './entities/disabledReasons.entity';
dotenv.config();

@Controller('api/beds')
@ApiTags('beds')
export class BedsController {
    constructor(
        private readonly bedsService: BedsService,
        private readonly usersService: UsersService,
        private readonly wardsService: WardsService
    ) {}

    @ApiResponse({
        status: 200,
        description: 'Get bed status',
        type: BedStatus,
        isArray: true
    })
    @ApiQuery({
        name: 'ward_id',
        required: false,
        type: Number
    })
    @ApiQuery({
        name: 'ward_ids',
        required: false,
        type: Number,
        isArray: true
    })
    @ApiQuery({
        name: 'bed_ids',
        required: false,
        type: Number,
        isArray: true
    })
    @ApiQuery({
        name: 'hospital_id',
        required: false,
        type: Number
    })
    @Get('statuses')
    getBedStatus(
        @Query('ward_id') ward_id: number,
        @Query('bed_ids') bed_ids: number[],
        @Query('ward_ids') ward_ids: number[],
        @Query('hospital_id') hospital_id: number
    ): Promise<BedStatus[]> {
        if (ward_id) {
            return this.bedsService.getBedStatusByWard(ward_id);
        } else if (bed_ids) {
            return this.bedsService.getBedStatusByIds(bed_ids);
        } else if (ward_ids) {
            return this.bedsService.getBedStatusByWardIds(ward_ids);
        } else if (hospital_id) {
            return this.bedsService.getBedStatusByHospital(hospital_id);
        } else {
            throw new HttpException(
                'Please provide a ward_id or bed_ids',
                HttpStatus.BAD_REQUEST
            );
        }
    }

    @ApiResponse({
        status: 200,
        description: 'Get all beds',
        type: Bed,
        isArray: true
    })
    @Get('all/:ward_id')
    getAllBeds(@Param('ward_id') ward_id: number): Promise<Bed[]> {
        return this.bedsService.getAllBeds(ward_id);
    }

    @ApiResponse({
        status: 200,
        description: 'Get total number of beds in a hospital',
        type: Number
    })
    @ApiQuery({
        name: 'hospital_id',
        required: true,
        type: Number
    })
    @Get('total')
    getTotalBeds(@Query('hospital_id') hospital_id: number): Promise<number> {
        return this.bedsService.getTotalBedsInHospital(hospital_id);
    }

    @ApiResponse({
        status: 200,
        description: 'Get bed by id',
        type: Bed
    })
    @Get('find/:bed_id')
    getBedById(@Param('bed_id') bed_id: number): Promise<Bed> {
        return this.bedsService.getBedById(bed_id);
    }

    @ApiResponse({
        status: 200,
        description: 'Get active bed occupancy',
        type: BedOccupancy,
        isArray: true
    })
    @Get('find/:bed_id/active')
    getActiveBedOccupancy(
        @Param('bed_id') bed_id: number
    ): Promise<BedOccupancy[]> {
        return this.bedsService.getActiveBedOccupancy(bed_id);
    }

    @ApiResponse({
        status: 200,
        description: 'Get bed status by id',
        type: BedStatus
    })
    @Get('find/:bed_id/status')
    getBedStatusById(@Param('bed_id') bed_id: number): Promise<BedStatus> {
        return this.bedsService.getBedStatusById(bed_id);
    }

    @ApiResponse({
        status: 200,
        description: 'Delete bed by id',
        type: String
    })
    @Delete('delete/:bed_id')
    async deleteBedById(
        @Param('bed_id') bed_id: number,
        @Headers('email') email?: string
    ): Promise<string> {
        const requestingUser = await this.usersService.findByEmail(email);
        const bed = await this.bedsService.getBedById(bed_id);
        const ward = await this.wardsService.findWardById(bed.ward_id);

        if (
            (requestingUser?.can_administrate &&
                ward.hospital_id === requestingUser.hospital_id) ||
            process.env.NODE_ENV === 'development' ||
            process.env.NODE_ENV === 'test'
        ) {
            return this.bedsService.deleteBedById(bed_id);
        } else {
            throw new HttpException(
                'Unauthorized access',
                HttpStatus.UNAUTHORIZED
            );
        }
    }

    @ApiResponse({
        status: 201,
        description: 'Create a new bed occupancy',
        type: CreateBedOccupancyDto
    })
    @Post('occupancy')
    createBedOccupancy(@Body() createBedOccupancyDto: CreateBedOccupancyDto) {
        return this.bedsService.createBedOccupancy(createBedOccupancyDto);
    }

    @Patch('disable/:bed_id')
    disableBed(
        @Param('bed_id') bed_id: number,
        @Query('reason_id') reason_id: number
    ) {
        return this.bedsService.disableBed(bed_id, reason_id);
    }

    @Patch('enable/:bed_id')
    enableBed(@Param('bed_id') bed_id: number) {
        return this.bedsService.enableBed(bed_id);
    }

    @Post('create')
    @ApiResponse({
        status: 201,
        description: 'Create a new bed',
        type: Bed
    })
    async createBed(
        @Body() bed: BedDto,
        @Headers('email') email?: string
    ): Promise<Bed> {
        const requestingUser = await this.usersService.findByEmail(email);
        const ward = await this.wardsService.findWardById(bed.ward_id);

        if (
            (requestingUser?.can_administrate &&
                ward.hospital_id === requestingUser.hospital_id) ||
            process.env.NODE_ENV === 'development' ||
            process.env.NODE_ENV === 'test'
        ) {
            return this.bedsService.createBed(bed);
        } else {
            throw new HttpException(
                'Unauthorized access',
                HttpStatus.UNAUTHORIZED
            );
        }
    }

    @Post('checkout')
    checkoutBedOccupancy(
        @Body() checkoutBedOccupancyDto: CheckoutBedOccupancyDto,
        @Query('bed_id') bed_id?: number,
        @Query('patient_id') patient_id?: number
    ) {
        return this.bedsService.checkoutBedOccupancy(
            checkoutBedOccupancyDto,
            bed_id,
            patient_id
        );
    }

    @Get('disabled_reasons')
    @ApiResponse({
        status: 200,
        description: 'Get all disabled reasons',
        type: DisabledReason,
        isArray: true
    })
    getDisabledReasons(): Promise<DisabledReason[]> {
        return this.bedsService.getDisabledReasons();
    }
}
