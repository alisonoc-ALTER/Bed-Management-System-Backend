import {
    Injectable,
    HttpException,
    HttpStatus,
    Inject,
    forwardRef
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bed } from './entities/bed.entity';
import { BedOccupancy } from './entities/bedOccupancy.entity';
import { CreateBedOccupancyDto } from './dto/createBedOccupancy.dto';
import { CheckoutBedOccupancyDto } from './dto/checkoutBedOccupancy.dto';
import { BedDto } from './dto/Bed.dto';
import { BedStatus } from './entities/bedStatus.entity';
import { DisabledReason } from './entities/disabledReasons.entity';
import { WardsService } from 'src/wards/wards.service';
import { TransfersService } from 'src/transfers/transfers.service';

@Injectable()
export class BedsService {
    constructor(
        @InjectRepository(Bed)
        private bedsRepository: Repository<Bed>,
        @InjectRepository(BedOccupancy)
        private bedOccupancyRepository: Repository<BedOccupancy>,
        @InjectRepository(DisabledReason)
        private disabledReasonsRepository: Repository<DisabledReason>,
        @Inject(forwardRef(() => WardsService))
        private readonly wardsService: WardsService,
        @Inject(forwardRef(() => TransfersService))
        private readonly transfersService: TransfersService
    ) {}

    async getBedStatusByWard(ward_id: number): Promise<BedStatus[]> {
        const beds = await this.bedsRepository.find({
            where: { ward_id: ward_id },
            relations: ['disabled_reason']
        });

        const bedStatuses = await Promise.all(
            beds.map(async (bed) => {
                return {
                    id: bed.id,
                    disabled: bed.disabled,
                    disabled_reason: bed.disabled_reason
                };
            })
        );

        return bedStatuses;
    }

    async getBedStatusByHospital(hospital_id: number): Promise<BedStatus[]> {
        const wardIds = (await this.wardsService.findAll(hospital_id)).map(
            (ward) => ward.id
        );
        return await this.getBedStatusByWardIds(wardIds);
    }

    async getTotalBedsInHospital(hospital_id: number): Promise<number> {
        const wardIds = (await this.wardsService.findAll(hospital_id)).map(
            (ward) => ward.id
        );
        const beds = wardIds.map((ward_id) => {
            return this.bedsRepository.find({
                where: { ward_id: ward_id }
            });
        });
        const bedsArray = await Promise.all(beds);
        const hospitalSize = bedsArray.flat().length;
        return hospitalSize;
    }

    async getBedStatusByWardIds(ward_ids: number[]): Promise<BedStatus[]> {
        const bedStatusPromises = ward_ids.map(async (ward_id) => {
            return this.getBedStatusByWard(ward_id);
        });

        const bedStatuses = await Promise.all(bedStatusPromises);
        return bedStatuses.flat();
    }

    async getBedStatusById(bed_id: number): Promise<BedStatus> {
        const bed = await this.bedsRepository.findOne({
            where: { id: bed_id },
            relations: ['disabled_reason']
        });

        return {
            id: bed.id,
            disabled: bed.disabled,
            disabled_reason: bed.disabled_reason
        };
    }

    async getBedStatusByIds(bed_ids: number[]): Promise<BedStatus[]> {
        const bedStatusPromises = bed_ids.map(async (bed_id) => {
            return this.getBedStatusById(bed_id);
        });

        return Promise.all(bedStatusPromises);
    }

    async disableBed(bed_id: number, reason_id: number): Promise<string> {
        await this.bedsRepository.update(bed_id, {
            disabled_reason_id: reason_id,
            disabled: true
        });
        return 'Bed disabled successfully';
    }

    async enableBed(bed_id: number): Promise<string> {
        const occupancy = await this.bedOccupancyRepository
            .createQueryBuilder('occupancy')
            .where('occupancy.bed_id = :bed_id', { bed_id: bed_id })
            .andWhere('occupancy.checkout_time IS NULL')
            .getOne();
        if (!occupancy) {
            await this.bedsRepository.update(bed_id, {
                disabled_reason_id: null,
                disabled: false
            });
            return 'Bed enabled successfully';
        } else {
            throw new HttpException(
                'Bed cannot be enabled as it is currently occupied',
                HttpStatus.CONFLICT
            );
        }
    }

    async createBed(bed: BedDto): Promise<Bed> {
        return this.bedsRepository.save(bed);
    }

    async getBedById(bed_id: number): Promise<Bed> {
        return this.bedsRepository.findOne({
            where: { id: bed_id },
            relations: ['room', 'disabled_reason']
        });
    }

    async deleteBedById(bed_id: number): Promise<string> {
        await this.bedsRepository.delete(bed_id);
        return 'Bed deleted successfully';
    }

    async getAllBeds(ward_id: number): Promise<Bed[]> {
        return this.bedsRepository.find({
            where: { ward_id },
            relations: ['room', 'disabled_reason']
        });
    }

    async getActiveBedOccupancy(bed_id: number): Promise<BedOccupancy[]> {
        return this.bedOccupancyRepository
            .createQueryBuilder('occupancy')
            .where('occupancy.bed_id = :bed_id', { bed_id })
            .andWhere('occupancy.checkout_time IS NULL')
            .getMany();
    }

    async createBedOccupancy(
        dto: CreateBedOccupancyDto
    ): Promise<BedOccupancy> {
        let occupancy: BedOccupancy = null;
        if (!(await this.getBedStatusById(dto.bed_id)).disabled) {
            this.disableBed(dto.bed_id, 2); // disabled_reason id 2 needs to be = 'Occupied'
            occupancy = this.bedOccupancyRepository.create(dto);
            await this.bedOccupancyRepository.save(occupancy);
        } else {
            throw new HttpException('Bed is disabled', HttpStatus.CONFLICT);
        }
        return occupancy;
    }

    async checkoutBedOccupancy(
        dto: CheckoutBedOccupancyDto,
        bed_id?: number,
        patient_id?: number
    ): Promise<string> {
        const queryBuilder = this.bedOccupancyRepository
            .createQueryBuilder()
            .update()
            .set({ checkout_time: dto.checkout_time })
            .where('checkout_time IS NULL');

        if (bed_id) {
            queryBuilder.andWhere('bed_id = :bed_id', { bed_id });
        }

        if (patient_id) {
            queryBuilder.andWhere('patient_id = :patient_id', { patient_id });
        }

        const pendingTransfers = await this.transfersService.findByPatientId(
            patient_id,
            'pending'
        );
        pendingTransfers.forEach((transfer) => {
            console.info('Deleting transfer', transfer.id);
            this.transfersService.delete(transfer.id);
        });
        await queryBuilder.execute();

        this.disableBed(bed_id, 1); // disabled_reason id 1 needs to be = 'Cleaning'
        return 'Checked out successfully';
    }

    async getDisabledReasons(): Promise<DisabledReason[]> {
        return this.disabledReasonsRepository.find();
    }
}
