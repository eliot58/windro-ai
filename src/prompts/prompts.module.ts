import { Module } from '@nestjs/common';

import { AdminPromptsController } from './admin-prompts.controller';
import { PromptsService } from './prompts.service';

@Module({
  controllers: [AdminPromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
